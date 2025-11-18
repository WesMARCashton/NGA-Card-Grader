

export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface SubGradeDetail {
  grade: number;
  notes: string;
}

export interface EvaluationDetails {
  centering: SubGradeDetail;
  corners: SubGradeDetail;
  edges: SubGradeDetail;
  surface: SubGradeDetail;
  printQuality: SubGradeDetail;
}

export type CardStatus = 'grading' | 'needs_review' | 'reviewed' | 'grading_failed' | 'challenging' | 'regenerating_summary';

export interface CardData {
  id:string;
  status: CardStatus;
  
  // Card Overview
  name?: string;
  team?: string;
  set?: string;
  edition?: string; // e.g., 'Base', 'Chrome', 'Refractor'
  cardNumber?: string;
  company?: string;
  year?: string;
  
  frontImage: string;
  backImage: string;
  
  overallGrade?: number;
  gradeName?: string; // e.g., "Mint", "Gem Mint"
  
  details?: EvaluationDetails;
  summary?: string;
  
  timestamp: number;
  gradingSystem: 'NGA';
  isSynced?: boolean;

  errorMessage?: string;
  challengeDirection?: 'higher' | 'lower';
}

export type AppView = 'scanner' | 'history';