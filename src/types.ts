export interface Guess {
  label: string;
  confidence: number;
}

export interface GuessResponse {
  success: boolean;
  guesses: Guess[];
  description: string;
  matched: boolean;
  backendUsed: 'HuggingFace' | 'Gemini' | 'Mock';
  errorDetail?: string;
}

export interface Challenge {
  prompt: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  hint: string;
}

export interface GameStats {
  score: number;
  completedStreak: number;
  totalAttempts: number;
  successfulDrawings: string[];
}
