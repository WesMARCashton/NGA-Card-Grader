
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
  isAdminView?: boolean;
  onToggleAdmin?: (isAdmin: boolean) => void;
  onMigrate?: () => Promise<void>;
  userName: string;
}

const CardRow: React.FC<{ card: CardData; onSelect: () => void; onDelete: () => void; isAdminView?: boolean }> = ({ card, onSelect, onDelete, isAdminView }) => {
  return (
    <div 
      className="bg-white p-4 rounded-lg flex items-center gap-4 shadow-lg transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.01]"
      onClick={onSelect}
    >
      <img src={ensureDataUrl(card.frontImage)} alt="Card" className="w-16 h-22 object-contain rounded-md bg-slate-100"/>
      <div className="flex-grow">
        <p className="font-bold text-lg">{card.name || 'Identifying...'}</p>
        <p className="text-sm text-slate-600">{card.year} {card.set} #{card.cardNumber}</p>
        {isAdminView && card.scannedBy && (
            <p className="text-[10px] text-blue-600 font-bold mt-1">👤 SUBMITTED BY: {card.scannedBy}</p>
        )}
      </div>
      <div className="text-right w-24">
        <p className="text-xs text-slate-500">GRADE</p>
        <p className="font-bold text-3xl text-blue-600">{(card.overallGrade || 0).toFixed(1)}</p>
      </div>
      {!isAdminView && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-slate-400 hover:text-red-500 transition">
            <TrashIcon className="w-5 h-5" />
          </button>
      )}
    </div>
  );
};

export const CardHistory: React.FC<CardHistoryProps> = (props) => {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [isSheetSettingsOpen, setIsSheetSettingsOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const collectionCards = props.cards.filter(c => c.status === 'reviewed');
  const unsyncedCards = collectionCards.filter(c => !c.isSynced);
  
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-center">
            <button onClick={props.onBack} className="flex items-center gap-2 text-blue-600 font-bold"><BackIcon className="w-5 h-5" /> Back</button>
            <h1 className="text-2xl font-bold">{props.isAdminView ? 'Master Hub' : 'My Collection'}</h1>
            <button onClick={() => setIsSheetSettingsOpen(true)} className="p-2 bg-slate-100 rounded-lg"><CogIcon className="w-5 h-5" /></button>
        </div>

        {props.isAdminView ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-md">
                    <p className="text-xs uppercase opacity-80">Total Cards</p>
                    <p className="text-2xl font-black">{props.cards.length}</p>
                </div>
                <div className="bg-green-600 text-white p-4 rounded-xl shadow-md">
                    <p className="text-xs uppercase opacity-80">Avg. Grade</p>
                    <p className="text-2xl font-black">
                        {(props.cards.reduce((acc, c) => acc + (c.overallGrade || 0), 0) / (props.cards.length || 1)).toFixed(2)}
                    </p>
                </div>
            </div>
        ) : (
            <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <GoogleSheetIcon className="w-8 h-8" />
                    <div>
                        <p className="text-sm font-bold">Sheet Sync Status</p>
                        <p className="text-xs text-slate-500">{unsyncedCards.length} cards pending</p>
                    </div>
                </div>
                <button 
                    onClick={() => setIsSyncModalOpen(true)}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm"
                >
                    Sync Hub
                </button>
            </div>
        )}

        <div className="space-y-4">
            {props.cards.length === 0 ? (
                <div className="py-20 text-center text-slate-400 border-2 border-dashed rounded-xl">
                    No cards found in {props.isAdminView ? 'Master Hub' : 'Drive'}.
                </div>
            ) : (
                props.cards.map(c => (
                    <CardRow key={c.id} card={c} onSelect={() => setSelectedCard(c)} onDelete={() => props.onDelete(c.id)} isAdminView={props.isAdminView} />
                ))
            )}
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
                onToggleAdmin={props.onToggleAdmin}
                onMigrate={props.onMigrate}
            />
        )}

        {isSyncModalOpen && (
            <SyncSheetModal 
                cardsToSync={unsyncedCards}
                onClose={() => setIsSyncModalOpen(false)}
                getAccessToken={props.getAccessToken}
                onSyncSuccess={props.onCardsSynced}
                userName={props.userName}
            />
        )}
    </div>
  );
};
