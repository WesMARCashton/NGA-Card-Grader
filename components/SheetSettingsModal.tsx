
import React, { useState, useEffect } from 'react';
import { CheckIcon, CogIcon, ResyncIcon, SpinnerIcon } from './icons';

interface SheetSettingsModalProps {
    onClose: () => void;
    onToggleAdmin?: (isAdmin: boolean) => void;
    onMigrate?: () => Promise<void>;
}

const STORAGE_KEY = 'google_sheet_url';
const ADMIN_KEY = 'is_admin_mode';

export const SheetSettingsModal: React.FC<SheetSettingsModalProps> = ({ onClose, onToggleAdmin, onMigrate }) => {
    const [sheetUrl, setSheetUrl] = useState('');
    const [isAdmin, setIsAdmin] = useState(localStorage.getItem(ADMIN_KEY) === 'true');
    const [isSaved, setIsSaved] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);

    useEffect(() => {
        const savedUrl = localStorage.getItem(STORAGE_KEY);
        if (savedUrl) setSheetUrl(savedUrl);
    }, []);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, sheetUrl.trim());
        localStorage.setItem(ADMIN_KEY, isAdmin.toString());
        if (onToggleAdmin) onToggleAdmin(isAdmin);
        setIsSaved(true);
        setTimeout(() => {
            setIsSaved(false);
            onClose();
        }, 1000);
    };

    const handleMigrateClick = async () => {
        if (!onMigrate) return;
        setIsMigrating(true);
        try {
            await onMigrate();
            alert("Migration successful! All your cards have been published to the Master Hub.");
        } catch (e: any) {
            alert("Migration failed: " + e.message);
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">Advanced Settings</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 text-2xl">&times;</button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label htmlFor="settings-sheet-url" className="block text-sm font-medium text-slate-700 mb-1">Master Hub (Google Sheet URL)</label>
                        <input
                            type="url"
                            id="settings-sheet-url"
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1 italic">This is the shared destination for all user data.</p>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                            <p className="text-sm font-bold text-slate-800">Admin Mode</p>
                            <p className="text-xs text-slate-500">View Master Hub data instead of private Drive</p>
                        </div>
                        <button 
                            onClick={() => setIsAdmin(!isAdmin)}
                            className={`w-12 h-6 rounded-full transition-colors relative ${isAdmin ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isAdmin ? 'translate-x-7' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="pt-2">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Tools</p>
                        <button 
                            onClick={handleMigrateClick}
                            disabled={isMigrating || !sheetUrl}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-lg transition disabled:opacity-50"
                        >
                            {isMigrating ? <SpinnerIcon className="w-5 h-5" /> : <ResyncIcon className="w-5 h-5" />}
                            <span>Publish Private Data to Hub</span>
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onClose} className="py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md transition">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className={`py-2 px-4 flex items-center justify-center gap-2 text-white font-semibold rounded-md transition ${isSaved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isSaved ? <CheckIcon className="w-5 h-5" /> : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
