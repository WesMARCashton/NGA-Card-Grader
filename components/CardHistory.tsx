
import React, { useState, useEffect } from 'react';
import { CardData } from '../types';
import { ExportIcon, BackIcon, TrashIcon, GoogleSheetIcon, ResyncIcon, SpinnerIcon, CheckIcon, CogIcon } from './icons';
import { CardDetailModal } from './CardDetailModal';
import { SyncSheetModal } from './SyncSheetModal';
import { SheetSettingsModal } from './SheetSettingsModal';
import { ensureDataUrl } from '../utils/fileUtils';

interface CardHistoryProps {
  cards: CardData[];
  onBack: () => void;
  onDelete: (cardId: string) => void;
  getAccessToken: () => Promise<string>;
  onCardsSynced: (syncedCards: CardData[]) => void;
  onChallengeGrade: (card: CardData, direction: 'higher' | 'lower') => void;
  onResync: (card: CardData) => Promise<void>;
  onRetryGrading: (card: CardData) => void; 
  onRewriteAllAnalyses: () => Promise<void>;
  resetRewriteState: () => void;
  isRewriting: boolean;
  rewriteProgress: number;
  rewrittenCount: number;
  rewriteFailCount: number;
  rewriteStatusMessage: string;
  onAcceptGrade: (cardId: string) => void;
  onManualGrade: (card: CardData, grade: number, gradeName: string) => void;
  onLoadCollection?: () => void;
  onGetMarketValue: (card: CardData) => void; 
  userName: string;
}

const CardRow: React.FC<{ card: CardData; onSelect: () => void; onDelete: () => void; }> = ({ card, onSelect, onDelete }) => {
  const isProcessing = ['grading', 'challenging', 'regenerating_summary', 'generating_summary', 'fetching_value'].includes(card.status);
  
  const getStatusIndicator = () => {
    switch (card.status) {
        case 'grading': return <div className="text-sm font-semibold text-blue-600">Grading...</div>;
        case 'challenging': return <div className="text-sm font-semibold text-yellow-600">Challenging...</div>;
        case 'needs_review': return <div className="text-sm font-bold text-green-600">Review</div>;
        case 'grading_failed': return <div className="text-sm font-semibold text-red-600">Failed</div>;
        default: return <p className="text-sm font-semibold text-slate-600">{card.gradeName || 'Grades'}</p>;
    }
  };

  return (
    <div 
      className={`bg-white p-4 rounded-lg flex items-center gap-4 shadow-lg transition-all duration-300 ${isProcessing ? 'opacity-70' : 'cursor-pointer hover:shadow-xl hover:scale-[1.01]'}`}
      onClick={!isProcessing ? onSelect : undefined}
    >
      <img src={ensureDataUrl(card.frontImage)} alt="Card" className="w-16 h-22 object-contain rounded-md bg-slate-100"/>
      <div className="flex-grow">
        <p className="font-bold text-lg">{card.name || 'Identifying...'}</p>
        <p className="text-sm text-slate-600">{card.year} {card.set} #{card.cardNumber}</p>
      </div>
      <div className="text-right w-24">
        <p className="text-xs text-slate-500">GRADE</p>
        <p className="font-bold text-3xl text-blue-600">{(card.overallGrade || 0).toFixed(1)}</p>
        {getStatusIndicator()}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-slate-400 hover:text-red-500 transition">
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export const CardHistory: React.FC<CardHistoryProps> = (props) => {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [isSheetSettingsOpen, setIsSheetSettingsOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [customSyncList, setCustomSyncList] = useState<CardData[] | null>(null);

  const collectionCards = props.cards.filter(c => c.status === 'reviewed');
  const unsyncedCards = collectionCards.filter(c => !c.isSynced);
  const needsReviewCards = props.cards.filter(c => c.status === 'needs_review' || c.status === 'grading_failed');

  const handleResyncAll = () => {
    if (collectionCards.length === 0) return;
    setCustomSyncList(collectionCards);
    setIsSyncModalOpen(true);
  };

  const exportToCsv = () => {
    const cardsToExport = props.cards.filter(c => c.status === 'reviewed');
    if (cardsToExport.length === 0) return;
    const headers = ['Name', 'Set', 'Year', 'Number', 'Grade', 'Mint Name'];
    const rows = cardsToExport.map(c => [c.name, c.set, c.year, c.cardNumber, c.overallGrade, c.gradeName].join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "collection.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-center">
            <button onClick={props.onBack} className="flex items-center gap-2 text-blue-600 font-bold hover:text-blue-500 transition">
                <BackIcon className="w-5 h-5" /> Back to Scanner
            </button>
            <h1 className="text-2xl font-bold">My Collection</h1>
            <div className="flex gap-2">
                <button onClick={exportToCsv} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition" title="Export CSV">
                    <ExportIcon className="w-5 h-5" />
                </button>
                <button onClick={() => setIsSheetSettingsOpen(true)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition">
                    <CogIcon className="w-5 h-5" />
                </button>
            </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg"><GoogleSheetIcon className="w-6 h-6" /></div>
                <div>
                    <p className="text-sm font-bold">Google Sheets Sync</p>
                    <p className="text-xs text-slate-500">{unsyncedCards.length} cards pending</p>
                </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <button 
                    onClick={handleResyncAll}
                    disabled={collectionCards.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition disabled:opacity-50"
                >
                    <ResyncIcon className="w-5 h-5" />
                    <span>Resync All</span>
                </button>
                <button 
                    onClick={() => setIsSyncModalOpen(true)}
                    disabled={unsyncedCards.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50"
                >
                    <CheckIcon className="w-5 h-5" />
                    <span>Sync Unsynced</span>
                </button>
            </div>
        </div>

        <div className="space-y-6">
            {needsReviewCards.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-green-700">Pending Review</h2>
                    {needsReviewCards.map(c => (
                        <CardRow key={c.id} card={c} onSelect={() => setSelectedCard(c)} onDelete={() => props.onDelete(c.id)} />
                    ))}
                </div>
            )}

            <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-800">Collection ({collectionCards.length})</h2>
                {props.cards.length === 0 ? (
                    <div className="py-20 text-center text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
                        <p className="mb-4">No cards in your collection.</p>
                        {props.onLoadCollection && (
                             <button onClick={props.onLoadCollection} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Load from Drive</button>
                        )}
                    </div>
                ) : (
                    collectionCards.map(c => (
                        <CardRow key={c.id} card={c} onSelect={() => setSelectedCard(c)} onDelete={() => props.onDelete(c.id)} />
                    ))
                )}
            </div>
        </div>

        {selectedCard && (
            <CardDetailModal 
                card={selectedCard} 
                onClose={() => setSelectedCard(null)} 
                onChallengeGrade={props.onChallengeGrade} 
                onAcceptGrade={props.onAcceptGrade}
                onDelete={props.onDelete}
                onManualGrade={props.onManualGrade}
                onGetMarketValue={props.onGetMarketValue}
            />
        )}

        {isSheetSettingsOpen && (
            <SheetSettingsModal 
                onClose={() => setIsSheetSettingsOpen(false)} 
            />
        )}

        {isSyncModalOpen && (
            <SyncSheetModal 
                cardsToSync={customSyncList || unsyncedCards}
                onClose={() => { setIsSyncModalOpen(false); setCustomSyncList(null); }}
                getAccessToken={props.getAccessToken}
                onSyncSuccess={props.onCardsSynced}
                userName={props.userName}
            />
        )}
    </div>
  );
};
