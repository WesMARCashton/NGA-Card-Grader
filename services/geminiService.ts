import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CardData, EvaluationDetails, MarketValue } from "../types";
import { dataUrlToBase64 } from "../utils/fileUtils";

const extractJson = (text: string): any => {
    if (!text) {
        throw new Error("AI returned an empty response.");
    }

    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = text.match(jsonRegex);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            throw new Error("AI returned invalid JSON inside markdown.");
        }
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error("AI response was not in expected JSON format.");
    }
}

const handleGeminiError = (error: any, context: string): Error => {
    console.error(`Error in ${context}:`, error);
    
    let originalErrorMessage = error.message || (typeof error === 'string' ? error : `An unexpected error occurred.`);

    if (originalErrorMessage.includes('{') && originalErrorMessage.includes('}')) {
        try {
            const parsedError = JSON.parse(originalErrorMessage.substring(originalErrorMessage.indexOf('{')));
            if (parsedError.error?.message) {
                originalErrorMessage = parsedError.error.message;
            }
        } catch (e) { /* Ignore */ }
    }

    if (originalErrorMessage.toLowerCase().includes('requested entity was not found')) {
        return new Error("API_KEY_RESET_REQUIRED");
    }

    if (originalErrorMessage.toLowerCase().includes('model is overloaded') || originalErrorMessage.toLowerCase().includes('busy')) {
        return new Error("The AI model is currently busy. We are retrying, but if this persists, please try again in a few minutes.");
    }
    
    if (originalErrorMessage.includes('api key') || originalErrorMessage.includes('401')) {
        return new Error("API_KEY_MISSING"); 
    }
    
    return new Error(`Error: ${originalErrorMessage}`);
};

const withRetry = async <T>(
  apiCall: () => Promise<T>,
  context: string,
  onRetry?: (attempt: number, delay: number) => void,
  retries = 15, // High retry count for stability
  initialDelay = 4000
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      let originalErrorMessage = error.message || '';
      
      const isRetryable = originalErrorMessage.toLowerCase().includes('model is overloaded') ||
                          originalErrorMessage.toLowerCase().includes('busy') ||
                          originalErrorMessage.toLowerCase().includes('unavailable') ||
                          originalErrorMessage.toLowerCase().includes('too many requests') ||
                          originalErrorMessage.includes('503') ||
                          originalErrorMessage.includes('504');

      if (isRetryable && i < retries - 1) {
        // Jittered exponential backoff
        const delay = Math.min(initialDelay * Math.pow(1.6, i) + Math.random() * 2000, 45000);
        onRetry?.(i + 1, delay);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw handleGeminiError(error, context);
      }
    }
  }
  throw handleGeminiError(lastError, context);
};

const NGA_GRADING_GUIDE = `
--- START OF NGA GRADING GUIDE ---

**CARD GRADING SYSTEM (Allows Half-Points e.g. 9.5, 8.5)**

**Overview of Categories**
Each card is evaluated in five key areas, each worth up to 10 points (increments of 0.5 are encouraged for high-end cards):
-   **Centering (Weight: 25%):** How well the image is centered front/back.
-   **Corners (Weight: 25%):** Sharpness and shape of all corners.
-   **Edges (Weight: 20%):** Cleanliness and uniformity of card borders.
-   **Surface (Weight: 20%):** Gloss, print marks, indentations, and scratches.
-   **Print Quality (Weight: 10%):** Focus, registration, and print defects.

**STEP 1: CENTERING (Front & Back)**
-   **Grade 10:** Perfect centering. Tolerance: 50/50 to 55/45 front.
-   **Grade 9.5:** Near perfect, virtually undetectable offset.
-   **Grade 9:** Slightly off-center. Tolerance: 60/40 front.
-   **Grade 8.5-1:** Progressively more off-center as per standard rules.

**STEP 2: CORNERS**
-   **Grade 10:** All four corners razor sharp.
-   **Grade 9.5:** One corner has the microscopic hint of a touch under magnification.
-   **Grade 9:** One corner slightly soft.

**STEP 3: EDGES**
-   **Grade 10:** Perfect, no nicks.
-   **Grade 9.5:** Flawless to the naked eye, one microscopic speck of white.

**STEP 4: SURFACE**
-   **Grade 10:** Flawless gloss.
-   **Grade 9.5:** One tiny, faint print line visible only under specific lighting.

**STEP 5: PRINT QUALITY**
-   **Grade 10:** Sharp focus, perfect registration.

**STEP 6: FINAL GRADE CALCULATION**
1.  Average the five subgrades.
2.  The final grade can be a whole number or a half-point (e.g., 9.5).
3.  Round the average to the nearest 0.5 increment (rounding DOWN if exactly between, e.g., 9.25 becomes 9.0, 9.75 becomes 9.5).
4.  Apply these adjustments:
    -   If one category is **2 or more grades below** the others -> **reduce final by 0.5 or 1 point**.
    -   If **surface or corners** subgrade is **below 6**, cap the overall grade at **6 maximum**.
    -   If the card has a **crease**, cap the grade at **5 automatically**.
    -   **Authentic (A)** may be used for cards that are genuine but too damaged to grade numerically.

--- END OF NGA GRADING GUIDE ---
`;

export interface CardIdentification {
    name: string;
    team: string;
    set: string;
    edition: string;
    cardNumber: string;
    company: string;
    year: string;
}

const getAIClient = () => {
  const apiKey = localStorage.getItem('nga_manual_api_key') || process.env.API_KEY || '';
  return new GoogleGenAI({ apiKey });
};

export const identifyCard = async (frontImageBase64: string, backImageBase64: string): Promise<CardIdentification> => {
    const ai = getAIClient();
    const prompt = `Identify the sports card from the images. Output JSON with fields: name, team, year, set, company, cardNumber, edition.`;
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        team: { type: Type.STRING },
        set: { type: Type.STRING },
        edition: { type: Type.STRING },
        cardNumber: { type: Type.STRING },
        company: { type: Type.STRING },
        year: { type: Type.STRING },
      },
      required: ['name', 'team', 'year', 'set', 'company', 'cardNumber', 'edition']
    };

    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: { parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
                { inlineData: { mimeType: 'image/jpeg', data: backImageBase64 } },
            ]},
            config: { 
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema,
            }
        }),
        'identifying card'
    );
    return extractJson(response.text);
};

export const gradeCardPreliminary = async (frontImageBase64: string, backImageBase64: string): Promise<{ details: EvaluationDetails, overallGrade: number, gradeName: string }> => {
    const ai = getAIClient();
    const prompt = `Perform a STRICT NGA grading analysis. Support half-points. ${NGA_GRADING_GUIDE}`;

    const subGradeDetailSchema = {
      type: Type.OBJECT,
      properties: { grade: { type: Type.NUMBER }, notes: { type: Type.STRING } },
      required: ['grade', 'notes'],
    };
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        details: {
          type: Type.OBJECT,
          properties: {
            centering: subGradeDetailSchema,
            corners: subGradeDetailSchema,
            edges: subGradeDetailSchema,
            surface: subGradeDetailSchema,
            printQuality: subGradeDetailSchema,
          },
        },
        overallGrade: { type: Type.NUMBER },
        gradeName: { type: Type.STRING },
      },
      required: ['details', 'overallGrade', 'gradeName'],
    };

    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: { parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
                { inlineData: { mimeType: 'image/jpeg', data: backImageBase64 } },
            ]},
             config: {
               temperature: 0.0,
               responseMimeType: "application/json",
               responseSchema,
             }
        }),
        'grading card preliminary'
    );
    return extractJson(response.text);
};

export const generateCardSummary = async (
    frontImageBase64: string, 
    backImageBase64: string, 
    cardData: Partial<CardData>
): Promise<string> => {
    const ai = getAIClient();
    const prompt = `Write a professional NGA grading summary (2-3 sentences) for: ${cardData.year} ${cardData.company} ${cardData.name} #${cardData.cardNumber}. Grade: ${cardData.overallGrade} (${cardData.gradeName}). Subgrades: ${JSON.stringify(cardData.details)}`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            summary: { type: Type.STRING }
        },
        required: ['summary']
    };

    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
                { inlineData: { mimeType: 'image/jpeg', data: backImageBase64 } },
            ]},
            config: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema,
            }
        }),
        'generating card summary'
    );
    
    const result = extractJson(response.text);
    return result.summary;
};

export const challengeGrade = async (
    card: CardData,
    direction: 'higher' | 'lower',
    onStatusUpdate: (status: string) => void
): Promise<{ details: EvaluationDetails, summary: string, overallGrade: number, gradeName: string }> => {
    onStatusUpdate('Initializing AI re-evaluation...');
    const ai = getAIClient();

    const challengePrompt = `Re-evaluate strictly as **${direction}** using NGA Guide. Initial: ${JSON.stringify(card.details)}`;

    const subGradeDetailSchema = {
      type: Type.OBJECT,
      properties: { grade: { type: Type.NUMBER }, notes: { type: Type.STRING } },
      required: ['grade', 'notes'],
    };
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        overallGrade: { type: Type.NUMBER },
        gradeName: { type: Type.STRING },
        details: {
          type: Type.OBJECT,
          properties: {
            centering: subGradeDetailSchema,
            corners: subGradeDetailSchema,
            edges: subGradeDetailSchema,
            surface: subGradeDetailSchema,
            printQuality: subGradeDetailSchema,
          },
        },
        summary: { type: Type.STRING },
      },
      required: ['overallGrade', 'gradeName', 'details', 'summary'],
    };

    const frontImageBase64 = dataUrlToBase64(card.frontImage);
    const backImageBase64 = dataUrlToBase64(card.backImage);
    
    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [
                { text: challengePrompt },
                { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
                { inlineData: { mimeType: 'image/jpeg', data: backImageBase64 } },
            ]},
            config: {
              responseMimeType: "application/json",
              responseSchema,
            }
        }), 
        'grade challenge'
    );

    return extractJson(response.text);
};

export const regenerateCardAnalysisForGrade = async (
    frontImageBase64: string,
    backImageBase64: string,
    cardInfo: { name: string, team: string, set: string, edition: string, cardNumber: string, company: string, year: string },
    targetGrade: number,
    targetGradeName: string,
    onStatusUpdate: (status: string) => void
): Promise<{ details: EvaluationDetails, summary: string }> => {
    const ai = getAIClient();
    const prompt = `Justify a grade of **${targetGrade} (${targetGradeName})** using NGA Guide.`;

    const subGradeDetailSchema = {
      type: Type.OBJECT,
      properties: { grade: { type: Type.NUMBER }, notes: { type: Type.STRING } },
      required: ['grade', 'notes'],
    };
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        details: {
          type: Type.OBJECT,
          properties: {
            centering: subGradeDetailSchema,
            corners: subGradeDetailSchema,
            edges: subGradeDetailSchema,
            surface: subGradeDetailSchema,
            printQuality: subGradeDetailSchema,
          },
        },
        summary: { type: Type.STRING },
      },
      required: ['details', 'summary'],
    };

    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
                { inlineData: { mimeType: 'image/jpeg', data: backImageBase64 } },
            ]},
            config: {
              responseMimeType: "application/json",
              responseSchema,
            }
        }), 
        'analysis regeneration'
    );

    return extractJson(response.text);
};

export const getCardMarketValue = async (
    card: CardData
): Promise<MarketValue> => {
    const ai = getAIClient();
    const cardSearchTerm = `${card.year} ${card.company} ${card.set} ${card.name} #${card.cardNumber} Grade ${card.overallGrade}`;

    const prompt = `Find recent sold prices for: "${cardSearchTerm}". Output JSON only with averagePrice, minPrice, maxPrice, currency.`;

    const response = await withRetry<GenerateContentResponse>(
        () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                tools: [{ googleSearch: {} }], 
                temperature: 0.1,
            }
        }),
        'getting market value'
    );

    const marketData = extractJson(response.text);
    const sourceUrls: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        chunks.forEach((chunk: any) => {
            if (chunk.web?.uri && chunk.web?.title) {
                sourceUrls.push({ title: chunk.web.title, uri: chunk.web.uri });
            }
        });
    }

    return {
        averagePrice: typeof marketData.averagePrice === 'number' ? marketData.averagePrice : 0,
        minPrice: typeof marketData.minPrice === 'number' ? marketData.minPrice : 0,
        maxPrice: typeof marketData.maxPrice === 'number' ? marketData.maxPrice : 0,
        currency: marketData.currency || 'USD',
        lastSoldDate: marketData.lastSoldDate,
        notes: marketData.notes,
        sourceUrls: sourceUrls
    };
};