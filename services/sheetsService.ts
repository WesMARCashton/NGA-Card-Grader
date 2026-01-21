import { CardData } from '../types';

const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Column Mapping:
 * A - Year (year)
 * B - Company (company)
 * C - Series (team)
 * D - Name (name)
 * E - Edition (edition)
 * F - Set (set)
 * G - Card Number (cardNumber)
 * H - Mint (gradeName)
 * I - Final Grade (overallGrade)
 * J - Leave Blank
 * K - Leave blank
 * L - Centering Grade
 * M - Centering Notes
 * N - Corners Grade
 * O - Corners Notes
 * P - Edges Grade
 * Q - Edges Notes
 * R - Surface Grade
 * S - Surface Notes
 * T - Print Quality Grade
 * U - Print Quality Notes
 * V - Summary
 * W - Leave Blank
 * X - Leave Blank
 * Y - Leave Blank
 * Z - Leave Blank
 */
const SHEET_HEADERS = [
    'YEAR', 'COMPANY', 'SERIES', 'NAME', 'EDITION', 'SET', 'NUMBER', 'MINT', 'GRADE',
    '', '', // J, K
    'CENTERING GRADE', 'CENTERING NOTES',
    'CORNERS GRADE', 'CORNERS NOTES',
    'EDGES GRADE', 'EDGES NOTES',
    'SURFACE GRADE', 'SURFACE NOTES',
    'PRINT QUALITY GRADE', 'PRINT QUALITY NOTES',
    'SUMMARY',
    '', '', '', '' // W, X, Y, Z
];

// Extracts the spreadsheet ID from a Google Sheet URL
const getSheetIdFromUrl = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
};

export const syncToSheet = async (accessToken: string, sheetUrl: string, cardsToSync: CardData[]): Promise<void> => {
    const spreadsheetId = getSheetIdFromUrl(sheetUrl);
    if (!spreadsheetId) {
        throw new Error("Invalid Google Sheet URL. Please provide a valid URL.");
    }

    if (cardsToSync.length === 0) {
        return; // Nothing to sync
    }
    
    // 1. Get spreadsheet metadata to find the name of the very first sheet.
    const sheetMetaResponse = await fetch(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets(properties.title)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!sheetMetaResponse.ok) {
        const error = await sheetMetaResponse.json();
        throw new Error(error.error?.message || "Could not retrieve spreadsheet details. Check URL and permissions.");
    }

    const sheetMetaData = await sheetMetaResponse.json();
    const firstSheetName = sheetMetaData.sheets[0].properties.title;

    // 2. Check if the sheet is empty to decide if we need headers
    const checkResponse = await fetch(`${SHEETS_API_URL}/${spreadsheetId}/values/'${encodeURIComponent(firstSheetName)}'!A1:A1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    const checkData = await checkResponse.json();
    const needsHeaders = !checkData.values || checkData.values.length === 0;

    // 3. Format the data into rows
    const rowsToAppend = [];
    
    if (needsHeaders) {
        rowsToAppend.push(SHEET_HEADERS);
    }

    const newRows = cardsToSync.sort((a,b) => a.timestamp - b.timestamp).map(card => {
        const company = (card.company || '').toString().toUpperCase();
        const series = (card.team || '').toString().toUpperCase();
        const set = (card.set || '').toString().toUpperCase();
        const name = (card.name || '').toString().toUpperCase();
        const edition = (card.edition || '').toString().toUpperCase();
        const cardNumber = card.cardNumber ? `#${card.cardNumber}`.toUpperCase() : '';
        const gradeName = (card.gradeName || '').toString().toUpperCase();
        
        // Final Row Mapping (Columns A-Z)
        return [
            (card.year || '').toString(), // A
            company,                      // B
            series,                       // C
            name,                         // D
            edition,                      // E
            set,                          // F
            cardNumber,                   // G
            gradeName,                    // H
            card.overallGrade,            // I
            '',                           // J
            '',                           // K
            card.details?.centering?.grade,  // L
            card.details?.centering?.notes,  // M
            card.details?.corners?.grade,    // N
            card.details?.corners?.notes,    // O
            card.details?.edges?.grade,      // P
            card.details?.edges?.notes,      // Q
            card.details?.surface?.grade,    // R
            card.details?.surface?.notes,    // S
            card.details?.printQuality?.grade, // T
            card.details?.printQuality?.notes, // U
            card.summary || '',              // V
            '',                              // W
            '',                              // X
            '',                              // Y
            ''                               // Z
        ];
    });

    rowsToAppend.push(...newRows);

    // 4. Append the data
    const appendRange = `'${firstSheetName}'!A1`;
    const appendResponse = await fetch(`${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: rowsToAppend })
    });
    
    if (!appendResponse.ok) {
        const error = await appendResponse.json();
        throw new Error(error.error?.message || "Failed to write data to the Google Sheet.");
    }
};