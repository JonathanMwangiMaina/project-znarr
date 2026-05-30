import GameInterface from './components/GameInterface';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between" id="app-canvas-container">
      {/* Primary Visual Arena */}
      <main className="flex-grow flex items-center justify-center p-4 md:p-8" id="app-main-content">
        <div className="w-full max-w-7xl bg-slate-900/30 rounded-3xl border border-slate-800 p-2 md:p-6 shadow-2xl backdrop-blur-xl" id="doodle-frame-wrapper">
          <GameInterface />
        </div>
      </main>

      {/* Humble, Professional Site footer */}
      <footer className="py-6 border-t border-slate-900 text-center" id="app-footer-bar">
        <p className="text-xs text-slate-500 font-mono">
          Developed as a high-fidelity AI Sketch Classifier. Built with React, Tailwind, and Node.js.
        </p>
      </footer>
    </div>
  );
}
