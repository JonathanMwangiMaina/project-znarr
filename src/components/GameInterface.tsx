import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, Flame, Play, SkipForward, Sparkles, RefreshCw, Cpu, 
  HelpCircle, Clock, CheckCircle, XCircle, Brain, AlertCircle 
} from 'lucide-react';
import DrawingCanvas from './DrawingCanvas';
import { DRAWING_CHALLENGES } from '../data/challenges';
import { GuessResponse, Challenge, GameStats } from '../types';

export default function GameInterface() {
  // Game mode configuration
  const [gameMode, setGameMode] = useState<'casual' | 'challenge'>('casual');
  const [modelPreference, setModelPreference] = useState<'gemini' | 'huggingface'>('gemini');

  // Canvas drawing data
  const [drawnImage, setDrawnImage] = useState<string | null>(null);
  const [brushColor, setBrushColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(7);

  // Challenge specifics
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>(DRAWING_CHALLENGES[0]);
  const [timeLeft, setTimeLeft] = useState<number>(45);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [hasCompletedChallenge, setHasCompletedChallenge] = useState<boolean>(false);

  // API response parameters
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [guessResponse, setGuessResponse] = useState<GuessResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Statistics tracker
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    completedStreak: 0,
    totalAttempts: 0,
    successfulDrawings: [],
  });

  // Local storage stats sync
  useEffect(() => {
    const saved = localStorage.getItem('doodle_guesser_stats');
    if (saved) {
      try {
        setStats(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse stats:', e);
      }
    }
  }, []);

  const saveStats = (newStats: GameStats) => {
    setStats(newStats);
    localStorage.setItem('doodle_guesser_stats', JSON.stringify(newStats));
  };

  // Challenge Timer hook
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      // Trigger auto-analysis when timer runs out and drawing exists
      if (drawnImage) {
        handleSubmitDrawing();
      } else {
        setApiError('Time is up! You did not draw anything to guess.');
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, timeLeft, drawnImage]);

  // Handle switching challenges
  const rollNewChallenge = () => {
    const currentIndex = DRAWING_CHALLENGES.indexOf(currentChallenge);
    let nextIndex = Math.floor(Math.random() * DRAWING_CHALLENGES.length);
    while (nextIndex === currentIndex && DRAWING_CHALLENGES.length > 1) {
      nextIndex = Math.floor(Math.random() * DRAWING_CHALLENGES.length);
    }

    setCurrentChallenge(DRAWING_CHALLENGES[nextIndex]);
    setTimeLeft(DRAWING_CHALLENGES[nextIndex].difficulty === 'Easy' ? 45 : DRAWING_CHALLENGES[nextIndex].difficulty === 'Medium' ? 30 : 25);
    setTimerActive(true);
    setGuessResponse(null);
    setApiError(null);
    setHasCompletedChallenge(false);
  };

  // Submit canvas base64 payload to custom backend
  const handleSubmitDrawing = async () => {
    if (!drawnImage) {
      setApiError('Your canvas is clean! Draw something before guessing.');
      return;
    }

    setIsAnalyzing(true);
    setApiError(null);
    setGuessResponse(null);

    let clientPrefilledGuesses: any[] | undefined = undefined;

    // Try client-side direct request first if model preference is Hugging Face to bypass server-side sandboxed network limits
    if (modelPreference === 'huggingface') {
      try {
        const base64Match = drawnImage.match(/^data:image\/(png|jpeg);base64,(.+)$/);
        if (base64Match) {
          const base64Data = base64Match[2];
          const binaryString = window.atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const hfModels = [
            'Salesforce/blip-image-captioning-base',
            'Salesforce/blip-image-captioning-large',
            'google/vit-base-patch16-224',
            'microsoft/resnet-50',
            'keras-io/quickdraw_classification',
          ];

          for (const model of hfModels) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);

              const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                },
                body: bytes,
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              if (hfResponse.ok) {
                const hfData = await hfResponse.json();
                if (Array.isArray(hfData) && hfData.length > 0) {
                  // Check if it is an Image-to-Text captioning model like BLIP
                  if (typeof hfData[0].generated_text === 'string') {
                    const raw_caption = hfData[0].generated_text.trim();
                    // Clean up common descriptive prefixes for raw matching comparison
                    const first_label = raw_caption
                      .replace(/^(a|an|the)\s+/, '')
                      .replace(/^(drawing|sketch|illustration|doodle)\s+of\s+(a|an|the)?\s*/i, '')
                      .replace(/^(line\s+)?(drawing|sketch)\s+of\s+/i, '');

                    clientPrefilledGuesses = [
                      { label: first_label || raw_caption, confidence: 0.95 },
                      { label: 'hand drawn sketch', confidence: 0.05 }
                    ];
                  } else {
                    clientPrefilledGuesses = hfData.slice(0, 5).map((item: any) => {
                      const labelVal = item.label || item.id || 'doodle';
                      const scoreVal = typeof item.score === 'number' ? item.score : (typeof item.confidence === 'number' ? item.confidence : 0.5);
                      return {
                        label: labelVal.replace(/_/g, ' '),
                        confidence: Number(scoreVal.toFixed(4)),
                      };
                    });
                  }
                  break;
                }
              }
            } catch (e) {
              console.log(`[Info] Direct frontend lookup for ${model} offline`);
            }
          }
        }
      } catch (err) {
        console.log('[Info] Direct frontend Hugging Face lookup finished offline. Moving to server-side.');
      }
    }

    try {
      const response = await fetch('/api/guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: drawnImage,
          targetPrompt: gameMode === 'challenge' ? currentChallenge.prompt : undefined,
          modelPreference,
          clientPrefilledGuesses,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned error status (${response.status}): ${errorText}`);
      }

      const data: GuessResponse = await response.json();
      setGuessResponse(data);

      if (data.success) {
        const attemptsCount = stats.totalAttempts + 1;
        
        if (gameMode === 'challenge') {
          setTimerActive(false);
          const isMatched = data.matched;
          
          let updatedStreak = stats.completedStreak;
          let updatedScore = stats.score;
          const successfulDrawings = [...stats.successfulDrawings];

          if (isMatched) {
            updatedStreak += 1;
            updatedScore += currentChallenge.difficulty === 'Easy' ? 10 : currentChallenge.difficulty === 'Medium' ? 20 : 35;
            if (!successfulDrawings.includes(currentChallenge.prompt)) {
              successfulDrawings.push(currentChallenge.prompt);
            }
            setHasCompletedChallenge(true);
          } else {
            updatedStreak = 0; // streak resets on a failed match attempt
          }

          saveStats({
            score: updatedScore,
            completedStreak: updatedStreak,
            totalAttempts: attemptsCount,
            successfulDrawings,
          });
        } else {
          // Casual mode simple stats addition
          saveStats({
            ...stats,
            totalAttempts: attemptsCount,
          });
        }
      } else {
        setApiError(data.errorDetail || 'AI was unable to process the drawing properly.');
      }
    } catch (err: any) {
      console.error('API Error:', err);
      setApiError(err.message || 'Server connection timed out. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset local storage stats
  const handleResetStats = () => {
    if (confirm('Are you sure you want to reset your Doodle Guesser achievements and scores?')) {
      saveStats({
        score: 0,
        completedStreak: 0,
        totalAttempts: 0,
        successfulDrawings: [],
      });
    }
  };

  // Color values helper for difficulty badges
  const getDifficultyColor = (diff: 'Easy' | 'Medium' | 'Hard') => {
    switch (diff) {
      case 'Easy': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Hard': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full py-4 max-w-7xl mx-auto px-4" id="game-dashboard-root">
      
      {/* Upper Navigation & Highlights Block */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5" id="game-nav-block">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-400 bg-clip-text text-transparent">
              Doodle Guesser
            </h1>
            <span className="text-[10px] uppercase font-mono tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 px-2 py-0.5 rounded-full">
              Full-Stack AI v2.5
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1 max-w-md">
            Sketch on the canvas and experience interactive artwork classification using Hugging Face models and Gemini API.
          </p>
        </div>

        {/* Achieved score board */}
        <div className="flex items-center gap-3.5" id="achievements-scoreboard">
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl px-4 shadow-md">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-mono uppercase">Total Score</span>
              <span className="text-lg font-bold text-slate-100">{stats.score} XP</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl px-4 shadow-md">
            <Flame className="w-5 h-5 text-rose-500" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-mono uppercase">Win Streak</span>
              <span className="text-lg font-bold text-slate-100">{stats.completedStreak} games</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Configuration (Mode select & Selector Engine preferred option) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="main-config-panel">
        
        {/* Play mode toggle switches */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-amber-400" />
            Game Mode
          </label>
          <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setGameMode('casual');
                setTimerActive(false);
                setGuessResponse(null);
                setApiError(null);
              }}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                gameMode === 'casual'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              id="mode-toggle-casual"
            >
              Casual Free-Draw
            </button>
            <button
              onClick={() => {
                setGameMode('challenge');
                rollNewChallenge();
              }}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                gameMode === 'challenge'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              id="mode-toggle-challenge"
            >
              Timed Challenge
            </button>
          </div>
        </div>

        {/* Inference engine option preferred */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            Classification Router Engine
          </label>
          <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setModelPreference('gemini')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                modelPreference === 'gemini'
                  ? 'bg-slate-800 text-amber-400 border border-amber-500/20 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              id="engine-item-gemini"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Gemini Vision (Super Precise)
            </button>
            <button
              onClick={() => setModelPreference('huggingface')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                modelPreference === 'huggingface'
                  ? 'bg-slate-800 text-indigo-400 border border-indigo-500/20 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              id="engine-item-hf"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Hugging Face API (Sketch Classifier)
            </button>
          </div>
        </div>

      </div>

      {/* Main Split Grid (Canvas and active controls on left, Guessing stats and criticism on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="main-gaming-grid">
        
        {/* Left Column - Drawing Arena */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            
            {/* Conditional challenge card drawer */}
            {gameMode === 'challenge' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-slate-900/45 border-l-4 border-l-indigo-500 border border-slate-800 p-4 rounded-xl flex flex-col gap-3"
                id="active-challenge-card"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-md">
                      Prompt Target
                    </span>
                    <span className={`text-xs border px-2 py-0.5 rounded-md font-medium ${getDifficultyColor(currentChallenge.difficulty)}`}>
                      {currentChallenge.difficulty}
                    </span>
                  </div>

                  {/* Timer widget inside active challenge card */}
                  <div className={`flex items-center gap-1 text-sm font-bold font-mono px-3 py-1 rounded-full border ${
                    timeLeft <= 10 
                      ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse' 
                      : 'bg-slate-900/80 text-amber-400 border-slate-800'
                  }`} id="timer-badge">
                    <Clock className="w-4 h-4" />
                    <span>{timeLeft}s</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-slate-100 flex items-center gap-2">
                    Draw: <span className="text-amber-400 underline decoration-indigo-500/50 underline-offset-4">{currentChallenge.prompt}</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={rollNewChallenge}
                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      title="Skip challenge"
                      id="btn-skip-challenge"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80 italic">
                  <HelpCircle className="w-3.5 h-3.5 inline mr-1 text-indigo-400" />
                  <strong>Tip:</strong> {currentChallenge.hint}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interactive drawing canvas component */}
          <DrawingCanvas
            onImageChange={setDrawnImage}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
          />

          {/* Submission and Control triggers */}
          <div className="flex items-center justify-end gap-3" id="canvas-submit-row">
            {gameMode === 'challenge' && !timerActive && !hasCompletedChallenge && (
              <button
                onClick={() => {
                  setTimeLeft(currentChallenge.difficulty === 'Easy' ? 45 : currentChallenge.difficulty === 'Medium' ? 30 : 25);
                  setTimerActive(true);
                  setApiError(null);
                  setGuessResponse(null);
                }}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-semibold text-sm flex items-center gap-1.5"
                id="btn-restart-timer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restart Timer</span>
              </button>
            )}

            <button
              onClick={handleSubmitDrawing}
              disabled={isAnalyzing || !drawnImage}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-rose-600 font-bold text-slate-950 hover:opacity-95 disabled:opacity-40 select-none cursor-pointer transition-all shadow-lg flex items-center justify-center gap-2 flex-grow sm:flex-grow-0"
              id="btn-submit-drawing"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>AI Guessing...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>Guess Doodle!</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column - Guess results and explanations */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Active Status Feed */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl min-h-[300px] flex flex-col justify-between" id="ai-results-workspace">
            
            <div id="results-header-section">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center justify-between">
                <span>AI Guessing Center</span>
                
                {guessResponse && (
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-mono">
                    via {guessResponse.backendUsed}
                  </span>
                )}
              </h3>
            </div>

            <div className="flex-grow flex flex-col justify-center py-6" id="results-core-content">
              
              {/* Default Empty State */}
              {!isAnalyzing && !guessResponse && !apiError && (
                <div className="text-center p-4 flex flex-col items-center justify-center" id="empty-results-fallback">
                  <div className="w-12 h-12 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center mb-3">
                    <Brain className="w-6 h-6 text-slate-500" />
                  </div>
                  <h4 className="font-semibold text-slate-300 text-sm">Analyze Pending</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
                    {gameMode === 'challenge' 
                      ? 'Submit your sketch before the timer finishes to grade your work!'
                      : 'Create a masterpiece, then press "Guess Doodle!" to challenge the AI.'}
                  </p>
                </div>
              )}

              {/* Loader with rotating visual indicators */}
              {isAnalyzing && (
                <div className="text-center p-4 flex flex-col items-center justify-center gap-4" id="guessing-analyzer-loader">
                  <div className="relative flex items-center justify-center" id="animation-spinner-container">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500/10 border-t-indigo-500 animate-spin" />
                    <Brain className="w-6 h-6 text-amber-400 absolute animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 text-sm">Reviewing Masterpiece</h4>
                    <p className="text-xs text-slate-500 mt-1 animate-pulse">Running visual neural classifiers...</p>
                  </div>
                </div>
              )}

              {/* Error Feed */}
              {apiError && (
                <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200 flex flex-col gap-2" id="results-error-alert">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold font-mono">Classification Trouble</span>
                  </div>
                  <p className="text-xs text-red-300">{apiError}</p>
                </div>
              )}

              {/* Successful Response Feed */}
              {guessResponse && guessResponse.success && (
                <div className="flex flex-col gap-5" id="analyzer-complete-results">
                  
                  {/* Matching Indicator for Challenges */}
                  {gameMode === 'challenge' && (
                    <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                      guessResponse.matched 
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                        : 'bg-rose-950/20 border-rose-900/30 text-rose-200'
                    }`} id="challenge-outcome-display">
                      {guessResponse.matched ? (
                        <>
                          <CheckCircle className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-extrabold uppercase">Success Match!</h4>
                            <p className="text-xs text-emerald-300/90 mt-0.5">The AI correctly mapped your layout as a {currentChallenge.prompt}!</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-7 h-7 text-rose-400 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-extrabold uppercase">Mismatch Guess</h4>
                            <p className="text-xs text-rose-300/90 mt-0.5">The neural network couldn&apos;t match drawing to a {currentChallenge.prompt}. Try adjusting stroke widths!</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Guess probability list */}
                  <div className="flex flex-col gap-3.5" id="guess-probability-list">
                    <h4 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">
                      Visual Class Probabilities
                    </h4>
                    
                    <div className="flex flex-col gap-2.5" id="guesses-wrapper">
                      {guessResponse.guesses.map((item, index) => {
                        const scorePct = Math.round(item.confidence * 100);
                        const isMainGuess = index === 0;

                        return (
                          <div key={item.label} className="flex flex-col gap-1" id={`guess-item-${index}`}>
                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-semibold capitalize ${isMainGuess ? 'text-amber-400 font-extrabold text-sm' : 'text-slate-300'}`}>
                                {index + 1}. {item.label}
                              </span>
                              <span className="font-mono font-bold text-slate-400">
                                {scorePct}%
                              </span>
                            </div>
                            
                            {/* Animated progress bar representing confidence */}
                            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${scorePct}%` }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                className={`h-full rounded-full ${
                                  isMainGuess 
                                    ? 'bg-gradient-to-r from-amber-400 to-rose-500 animate-pulse' 
                                    : 'bg-slate-700'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Critic explanation comment */}
                  <div className="bg-slate-950/80 p-3.5 border border-slate-850 rounded-xl relative" id="ai-critic-commentary">
                    <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[9px] font-mono font-semibold uppercase">
                      AI Art Critique
                    </div>
                    <p className="text-xs text-slate-300 italic leading-relaxed pt-1.5">
                      &ldquo;{guessResponse.description}&rdquo;
                    </p>
                  </div>

                </div>
              )}

            </div>

            {/* Optional error debug log */}
            {guessResponse?.errorDetail && (
              <div className="text-[10px] font-mono text-amber-500/80 bg-amber-500/5 p-2 rounded border border-amber-500/15" id="error-debug-panel">
                <strong>Subsystem log:</strong> {guessResponse.errorDetail}
              </div>
            )}

          </div>

          {/* User statistics ledger */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow" id="statistics-ledger">
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-3.5 flex items-center justify-between">
              <span>Achievements Ledger</span>
              <button
                onClick={handleResetStats}
                className="text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase font-sans font-medium"
                id="btn-reset-stats"
              >
                Clear Progress
              </button>
            </h4>

            <div className="grid grid-cols-2 gap-3 mb-4" id="stats-numbers-grid">
              <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 text-center">
                <span className="block text-xl font-black text-slate-200">{stats.totalAttempts}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Attempts</span>
              </div>
              <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 text-center">
                <span className="block text-xl font-black text-slate-200">{stats.successfulDrawings.length}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Different Prompts Won</span>
              </div>
            </div>

            {stats.successfulDrawings.length > 0 ? (
              <div id="stats-prompts-scroller">
                <span className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Mastered Sketches:</span>
                <div className="flex flex-wrap gap-1.5 max-h-[84px] overflow-y-auto pr-1" id="scroller-badge-box">
                  {stats.successfulDrawings.map((p) => (
                    <span 
                      key={p} 
                      className="text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded cursor-default"
                      id={`mastered-badge-${p.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic text-center">No challenges mastered yet. Get drawing!</p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
