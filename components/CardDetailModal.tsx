import React, { useState } from 'react';
import { CardData } from '../types';
import { GradeDisplay, EvaluationRow } from './GradeDisplays';
import { ImageLightbox } from './ImageLightbox';
import { GavelIcon, ArrowUpIcon, ArrowDownIcon, SpinnerIcon, CheckIcon, TrashIcon, EditIcon } from './icons';
import { ensureDataUrl } from '../utils/fileUtils';
import { ManualGradeModal } from './ManualGradeModal';


interface CardDetailModalProps {
  card: CardData;
  onClose: () => void;
  onChallengeGrade: (card: CardData, direction: 'higher' | 'lower') => void;
  onAcceptGrade: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onManualGrade: (card: CardData, grade: number, gradeName: string) => void;
}

const InfoPill: React.FC<{ label: string, value?: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
    <p className="font-medium text-slate-800">{value || 'N/A'}</p>
  </div>
);

export const CardDetailModal: React.FC<CardDetailModalProps> = ({ card, onClose, onChallengeGrade, onAcceptGrade, onDelete, onManualGrade }) => {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isChallenging, setIsChallenging] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const cardDescription = `${card.year || 'N/A'} ${card.set || ''} #${card.cardNumber || 'N/A'}`;
  
  const handleChallenge = (direction: 'higher' | 'lower') => {
    onChallengeGrade(card, direction);
    onClose();
  };

  const handleManualSave = (grade: number, gradeName: string) => {
    onManualGrade(card, grade, gradeName);
    setIsManualEntry(false);
    onClose(); // Close main modal after kicking off the background process
  };

  const handleAccept = () => {
    onAcceptGrade(card.id);
    onClose();
  };

  const handleRemove = () => {
    if (window.confirm('Are you sure you want to remove this card from your collection? This action cannot be undone.')) {
        onDelete(card.id);
        onClose();
    }
  };
  
  const renderFooter = () => {
    if (card.status === 'needs_review' || card.status === 'grading_failed') {
      return (
        <div className="pt-4 border-t space-y-3">
          {isChallenging ? (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
              <h3 className="font-bold text-center text-yellow-800 mb-3">Challenge Grade</h3>
              <p className="text-sm text-center text-yellow-700 mb-4">Ask the AI to re-evaluate the card with a bias that the grade should be higher or lower. This will be processed in the background.</p>
              <div className="flex gap-4">
                  <button onClick={() => handleChallenge('higher')} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition">
                      <ArrowUpIcon className="w-5 h-5 flex-shrink-0" />
                      <span>Challenge Higher</span>
                  </button>
                  <button onClick={() => handleChallenge('lower')} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition">
                      <ArrowDownIcon className="w-5 h-5 flex-shrink-0" />
                      <span>Challenge Lower</span>
                  </button>
              </div>
              <button onClick={() => setIsChallenging(false)} className="w-full text-center mt-3 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button onClick={handleAccept} className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition transform hover:scale-105">
                <CheckIcon className="w-5 h-5" /> Accept
              </button>
              <button onClick={() => setIsChallenging(true)} className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition transform hover:scale-105">
                <GavelIcon className="w-5 h-5" /> Challenge
              </button>
              <button onClick={() => setIsManualEntry(true)} className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition transform hover:scale-105">
                <EditIcon className="w-5 h-5" /> Manual
              </button>
              <button onClick={handleRemove} className="flex items-center justify-center gap-2 py-3 px-4 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg transition transform hover:scale-105">
                <TrashIcon className="w-5 h-5" /> Remove
              </button>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
        onClick={onClose}
      >
        <div 
          className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl space-y-6 p-6 md:p-8 relative max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 transition-colors z-10"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>

          <header className="text-center pt-4">
            <h1 className="text-3xl font-bold text-slate-900">{card.name || 'Unknown Card'}</h1>
            <p className="text-lg text-slate-600">{cardDescription}</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6 flex flex-col items-center">
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                  <img src={ensureDataUrl(card.frontImage)} alt="Card front" className="w-full rounded-lg shadow-md aspect-[2.5/3.5] object-contain bg-slate-100 cursor-zoom-in transition-transform hover:scale-105" onClick={() => setExpandedImage(card.frontImage)} />
                  <img src={ensureDataUrl(card.backImage)} alt="Card back" className="w-full rounded-lg shadow-md aspect-[2.5/3.5] object-contain bg-slate-100 cursor-zoom-in transition-transform hover:scale-105" onClick={() => setExpandedImage(card.backImage)} />
                </div>
                <div className="w-full p-4 bg-slate-100/50 rounded-lg">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 text-center mb-2">Likely NGA Grade</h4>
                    {(card.overallGrade !== undefined && card.gradeName) ? (
                      <GradeDisplay grade={card.overallGrade} gradeName={card.gradeName} />
                    ) : (
                      <div className="text-center p-4 text-slate-500">Not Graded</div>
                    )}
                </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
                <div className="p-4 bg-slate-100/50 rounded-lg">
                  <h2 className="text-xl font-bold text-blue-600 mb-4 border-b pb-2">🏒 Card Overview</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <InfoPill label="Name" value={card.name} />
                      <InfoPill label="Team" value={card.team} />
                      <InfoPill label="Set" value={card.set} />
                      <InfoPill label="Edition" value={card.edition} />
                      <InfoPill label="Card Number" value={card.cardNumber ? `#${card.cardNumber}` : 'N/A'} />
                      <InfoPill label="Company" value={card.company} />
                      <InfoPill label="Year" value={card.year} />
                  </div>
                </div>
                
                <div className="bg-slate-100/50 rounded-lg overflow-hidden">
                    <h2 className="text-xl font-bold text-blue-600 mb-2 p-4">🔍 NGA Evaluation Breakdown</h2>
                    {card.details ? (
                      <table className="w-full text-left">
                          <thead className="bg-slate-200/70">
                              <tr>
                                  <th className="py-2 px-4 text-sm font-semibold uppercase text-slate-600">Category</th>
                                  <th className="py-2 px-4 text-sm font-semibold uppercase text-slate-600 text-center">Subgrade</th>
                                  <th className="py-2 px-4 text-sm font-semibold uppercase text-slate-600">Notes</th>
                              </tr>
                          </thead>
                          <tbody>
                              <EvaluationRow category="Centering" grade={card.details.centering?.grade} notes={card.details.centering?.notes} />
                              <EvaluationRow category="Corners" grade={card.details.corners?.grade} notes={card.details.corners?.notes} />
                              <EvaluationRow category="Edges" grade={card.details.edges?.grade} notes={card.details.edges?.notes} />
                              <EvaluationRow category="Surface" grade={card.details.surface?.grade} notes={card.details.surface?.notes} />
                              <EvaluationRow category="Print Quality" grade={card.details.printQuality?.grade} notes={card.details.printQuality?.notes} />
                          </tbody>
                      </table>
                    ) : (
                      <p className="p-4 text-center text-slate-500">No evaluation details available.</p>
                    )}
                </div>
            </div>
          </div>
          
          <div className="p-4 bg-slate-100/50 rounded-lg">
            <h2 className="text-xl font-bold text-blue-600 mb-3">🧭 Summary</h2>
            <p className="text-slate-700 text-sm leading-relaxed">
              {card.summary || 'No summary available.'}
            </p>
          </div>

          {card.status === 'grading_failed' && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
                <h3 className="font-bold">Grading Failed</h3>
                <p className="text-sm">{card.errorMessage}</p>
            </div>
          )}

          {renderFooter()}

        </div>
      </div>
      {expandedImage && <ImageLightbox src={ensureDataUrl(expandedImage)} alt="Expanded card view" onClose={() => setExpandedImage(null)} />}
      {isManualEntry && (
        <ManualGradeModal
          initialGrade={card.overallGrade || 8}
          initialGradeName={card.gradeName || 'NM-MT'}
          onSave={handleManualSave}
          onClose={() => setIsManualEntry(false)}
          isSaving={card.status === 'regenerating_summary'}
          savingStatus={'Regenerating...'}
        />
      )}
    </>
  );
};