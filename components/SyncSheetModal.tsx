import React, { useState, useEffect } from 'react';
import { CardData } from '../types';
import { syncToSheet } from '../services/sheetsService';

interface SyncSheetModalProps {
    cardsToSync: CardData[];
    onClose: () => void;
    getAccessToken: () => Promise<string>;
    onSyncSuccess: (syncedCards: CardData[]) => void;
}

const STORAGE_KEY = 'google_sheet_url';

export const SyncSheetModal: React.FC<SyncSheetModalProps> = ({ cardsToSync, onClose, getAccessToken, onSyncSuccess }) => {
    const [sheetUrl, setSheetUrl] = useState('');
    const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const savedUrl = localStorage.getItem(STORAGE_KEY);
        if (savedUrl) {
            setSheetUrl(savedUrl);
        }
    }, []);

    const handleSync = async () => {
        if (!sheetUrl) {
            setErrorMessage("Please enter a Google Sheet URL.");
            setStatus('error');
            return;
        }
        if (cardsToSync.length === 0) {
            setErrorMessage("There are no new cards to sync.");
            setStatus('error');
            return;
        }

        setStatus('syncing');
        setErrorMessage('');
        
        try {
            const token = await getAccessToken();
            await syncToSheet(token, sheetUrl, cardsToSync);
            localStorage.setItem(STORAGE_KEY, sheetUrl);
            onSyncSuccess(cardsToSync); // Notify parent component of success
            setStatus('success');
        } catch (err: any) {
            console.error("Sync to sheet failed:", err);
            setErrorMessage(err.message || "An unknown error occurred.");
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">Sync Collection to Google Sheet</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800">&times;</button>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Enter the URL of your Google Sheet. This will <strong className="font-semibold text-green-600">add {cardsToSync.length} new cards</strong> to the next available row in the first tab of your sheet.
                    </p>
                    <div>
                        <label htmlFor="sheet-url" className="block text-sm font-medium text-slate-700 mb-1">Google Sheet URL</label>
                        <input
                            type="url"
                            id="sheet-url"
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            disabled={status === 'syncing'}
                        />
                    </div>

                    {status === 'error' && (
                        <div className="bg-red-100 text-red-700 p-3 rounded-md text-sm">
                            <strong>Error:</strong> {errorMessage}
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="bg-green-100 text-green-700 p-3 rounded-md text-sm">
                            <strong>Success!</strong> {cardsToSync.length} cards have been synced to your sheet.
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md transition"
                            disabled={status === 'syncing'}
                        >
                            {status === 'success' ? 'Close' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleSync}
                            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-wait"
                            disabled={status === 'syncing' || cardsToSync.length === 0}
                        >
                            {status === 'syncing' ? 'Syncing...' : `Sync ${cardsToSync.length} Cards`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};