
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardData, AppView, User } from './types';
import { CardScanner } from './components/CardScanner';
import { CardHistory } from './components/CardHistory';
import { Auth } from './components/Auth';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { 
  challengeGrade, 
  regenerateCardAnalysisForGrade,
  analyzeCardFull,
  getCardMarketValue
} from './services/geminiService';
import { getCollection, saveCollection } from './services/driveService';
import { syncToSheet, fetchCardsFromSheet } from './services/sheetsService';
import { HistoryIcon, KeyIcon, SpinnerIcon, CheckIcon, GavelIcon } from './components/icons';
import { dataUrlToBase64 } from './utils/fileUtils';
import { SyncSheetModal } from './components/SyncSheetModal';
import { ApiKeyModal } from './components/ApiKeyModal';

const BACKUP_KEY = 'nga_card_backup';
const MANUAL_API_KEY_STORAGE = 'manual_gemini_api_key';
const ADMIN_KEY = 'is_admin_mode';

if (typeof window !== 'undefined') {
  if (!(window as any).process) (window as any).process = { env: {} };
  const savedKey = localStorage.getItem(MANUAL_API_KEY_STORAGE);
  if (savedKey) (process.env as any).API_KEY = savedKey;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const App: React.FC = () => {
  const { user, signOut, getAccessToken, isAuthReady } = useGoogleAuth();
  
  const [view, setView] = useState<AppView>('scanner');
  const [cards, setCards] = useState<CardData[]>([]);
  const [isAdminMode, setIsAdminMode] = useState(localStorage.getItem(ADMIN_KEY) === 'true');
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(!!localStorage.getItem(MANUAL_API_KEY_STORAGE) || !!process.env.API_KEY);

  const processingCards = useRef(new Set<string>());
  const CONCURRENCY_LIMIT = 2;

  // Fetch data based on mode
  const refreshCollection = useCallback(async (silent: boolean = false) => {
    if (!user || !getAccessToken) return;
    setSyncStatus('loading');
    try {
      const token = await getAccessToken(silent);
      if (isAdminMode) {
        const sheetUrl = localStorage.getItem('google_sheet_url');
        if (!sheetUrl) throw new Error("No Master Hub URL configured.");
        const masterCards = await fetchCardsFromSheet(token, sheetUrl);
        setCards(masterCards);
      } else {
        const { fileId, cards: loadedCards } = await getCollection(token);
        setCards(loadedCards || []);
        setDriveFileId(fileId);
      }
      setSyncStatus('success');
    } catch (err: any) {
      setSyncStatus('error');
    }
  }, [user, getAccessToken, isAdminMode]);

  useEffect(() => {
    if (user) refreshCollection(true);
  }, [user, isAdminMode, refreshCollection]);

  const handleMigration = async () => {
    if (!user || !getAccessToken) return;
    const token = await getAccessToken();
    const sheetUrl = localStorage.getItem('google_sheet_url');
    if (!sheetUrl) throw new Error("Please configure a Master Hub URL in settings first.");
    
    // Migration logic: Sync ALL cards that aren't already marked as published in local state
    const { cards: localCards } = await getCollection(token);
    if (localCards.length === 0) return;
    
    await syncToSheet(token, sheetUrl, localCards, user.name);
    
    // Update Drive to mark all as synced
    const updatedCards = localCards.map(c => ({ ...c, isSynced: true }));
    await saveCollection(token, driveFileId, updatedCards);
    setCards(updatedCards);
  };

  const handleToggleAdmin = (isAdmin: boolean) => {
    setIsAdminMode(isAdmin);
    setView('history'); // Swapping mode usually means you want to see the collection
  };

  const saveCollectionToDrive = useCallback(async (cardsToSave: CardData[]) => {
    if (!user || !getAccessToken || isAdminMode) return; // Admin mode is Read-Only for the sheet view
    try {
      const token = await getAccessToken(true); 
      await saveCollection(token, driveFileId, cardsToSave);
    } catch (err: any) {}
  }, [user, getAccessToken, driveFileId, isAdminMode]);

  const processCardInBackground = useCallback(async (cardToProcess: CardData) => {
    if (processingCards.current.has(cardToProcess.id)) return;
    processingCards.current.add(cardToProcess.id);
    try {
      let finalCardData: Partial<CardData> = {};
      let finalStatus: CardData['status'] = 'needs_review';
      const f64 = dataUrlToBase64(cardToProcess.frontImage);
      const b64 = dataUrlToBase64(cardToProcess.backImage);

      switch (cardToProcess.status) {
        case 'grading':
          finalCardData = await analyzeCardFull(f64, b64);
          finalStatus = 'needs_review';
          break;
        case 'challenging':
          finalCardData = await challengeGrade(cardToProcess, cardToProcess.challengeDirection!, () => {});
          finalStatus = 'needs_review';
          break;
        case 'regenerating_summary':
          finalCardData = await regenerateCardAnalysisForGrade(f64, b64, cardToProcess, cardToProcess.overallGrade!, cardToProcess.gradeName!, () => {});
          finalStatus = 'reviewed';
          break;
        case 'fetching_value':
          finalCardData = { marketValue: await getCardMarketValue(cardToProcess) };
          finalStatus = 'reviewed';
          break;
        default:
          processingCards.current.delete(cardToProcess.id);
          return;
      }
      setCards(current => {
        const updated = current.map(c => c.id === cardToProcess.id ? { ...c, ...finalCardData, status: finalStatus, isSynced: false } : c);
        saveCollectionToDrive(updated);
        return updated;
      });
    } catch (err: any) {
      if (err.message === "API_KEY_MISSING") setShowApiKeyModal(true);
      setCards(current => {
        const updated = current.map(c => c.id === cardToProcess.id ? { ...c, status: 'grading_failed' as const, errorMessage: err.message } : c);
        saveCollectionToDrive(updated);
        return updated;
      });
    } finally {
      processingCards.current.delete(cardToProcess.id);
    }
  }, [saveCollectionToDrive]);

  useEffect(() => {
    const queue = cards.filter(c => ['grading', 'challenging', 'regenerating_summary', 'fetching_value'].includes(c.status) && !processingCards.current.has(c.id));
    if (queue.length > 0 && processingCards.current.size < CONCURRENCY_LIMIT) {
      queue.slice(0, CONCURRENCY_LIMIT - processingCards.current.size).forEach(c => processCardInBackground(c));
    }
  }, [cards, processCardInBackground]);

  const handleRatingRequest = useCallback(async (f: string, b: string) => {
    const newCard: CardData = { id: generateId(), frontImage: f, backImage: b, timestamp: Date.now(), gradingSystem: 'NGA', isSynced: false, status: 'grading' };
    setCards(current => {
        const updated = [newCard, ...current];
        saveCollectionToDrive(updated);
        return updated;
    });
  }, [saveCollectionToDrive]);

  return (
    <div className="min-h-screen font-sans flex flex-col items-center p-4">
        <header className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center p-4 gap-4">
            <div className="flex items-center gap-4">
              <img src="https://mcusercontent.com/d7331d7f90c4b088699bd7282/images/98cb8f09-7621-798a-803a-26d394c7b10f.png" alt="Logo" className="h-10 w-auto" />
              {isAdminMode && (
                <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded border border-amber-200 flex items-center gap-1">
                  <GavelIcon className="w-3 h-3" /> ADMIN
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <button onClick={() => setView(view === 'history' ? 'scanner' : 'history')} className="flex items-center gap-2 py-2 px-4 bg-white/70 hover:bg-white text-slate-800 font-semibold rounded-lg shadow-md transition border border-slate-300">
                  <HistoryIcon className="h-5 w-5" />
                  <span className="hidden sm:inline">{isAdminMode ? 'Master Hub' : 'My Collection'}</span>
                </button>
              )}
              <Auth user={user} onSignOut={signOut} isAuthReady={isAuthReady} />
            </div>
        </header>
        <main className="w-full flex-grow flex flex-col items-center">
            {view === 'history' ? (
                <CardHistory 
                  cards={cards} 
                  onBack={() => setView('scanner')} 
                  onDelete={id => setCards(cur => cur.filter(c => c.id !== id))} 
                  getAccessToken={() => getAccessToken(false)} 
                  onCardsSynced={c => setCards(cur => cur.map(card => c.some(s => s.id === card.id) ? { ...card, isSynced: true } : card))}
                  onChallengeGrade={(c, d) => setCards(cur => cur.map(x => x.id === c.id ? { ...x, status: 'challenging', challengeDirection: d } : x))}
                  onResync={async () => {}}
                  onRetryGrading={c => setCards(cur => cur.map(x => x.id === c.id ? { ...x, status: 'grading', errorMessage: undefined } : x))}
                  onRewriteAllAnalyses={async () => {}}
                  resetRewriteState={() => {}}
                  isRewriting={false} rewriteProgress={0} rewrittenCount={0} rewriteFailCount={0} rewriteStatusMessage={''}
                  onAcceptGrade={id => setCards(cur => cur.map(c => c.id === id ? { ...c, status: 'fetching_value' } : c))}
                  onManualGrade={(c, g, n) => setCards(cur => cur.map(x => x.id === c.id ? { ...x, status: 'regenerating_summary', overallGrade: g, gradeName: n } : x))}
                  onLoadCollection={() => refreshCollection(false)} 
                  onGetMarketValue={c => setCards(cur => cur.map(x => x.id === c.id ? { ...x, status: 'fetching_value' } : x))}
                  isAdminView={isAdminMode}
                  onToggleAdmin={handleToggleAdmin}
                  onMigrate={handleMigration}
                  userName={user?.name || 'Anonymous'}
                />
            ) : (
                <CardScanner 
                  onRatingRequest={handleRatingRequest} 
                  isGrading={false} 
                  gradingStatus={''} 
                  isLoggedIn={!!user}
                  hasCards={cards.length > 0}
                  onSyncDrive={() => refreshCollection(false)}
                  isSyncing={syncStatus === 'loading'}
                />
            )}
            
            {showApiKeyModal && (
              <ApiKeyModal 
                onSave={key => { localStorage.setItem(MANUAL_API_KEY_STORAGE, key); setHasApiKey(true); setShowApiKeyModal(false); }}
                onClose={() => setShowApiKeyModal(false)}
              />
            )}
        </main>
    </div>
  );
};

export default App;
