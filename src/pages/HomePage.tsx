import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Sparkles,
  Users,
  Target,
  Zap,
  Trophy,
  ArrowRight,
  ShieldCheck,
  Share2,
  HelpCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';

export const HomePage: React.FC = () => {
  const [joinInput, setJoinInput] = useState('');
  const [inputError, setInputError] = useState('');
  const navigate = useNavigate();

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError('');
    const trimmed = joinInput.trim();

    if (!trimmed) {
      setInputError('Please enter your invitation link or code');
      return;
    }

    // Check if user entered a full URL
    try {
      if (trimmed.includes('/join/')) {
        const parts = trimmed.split('/join/')[1]?.split('/');
        if (parts && parts.length >= 2) {
          navigate(`/join/${parts[0]}/${parts[1]}`);
          return;
        }
      } else if (trimmed.includes('/challenge/')) {
        const challengeToken = trimmed.split('/challenge/')[1];
        if (challengeToken) {
          navigate(`/challenge/${challengeToken}`);
          return;
        }
      }
    } catch {
      // ignore parse error and proceed
    }

    // If game-id / token pair
    if (trimmed.includes(':')) {
      const [gId, tok] = trimmed.split(':');
      navigate(`/join/${gId}/${tok}`);
      return;
    }

    setInputError('Please paste your full invitation URL or challenge link');
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
          {/* Subtle glowing ambient spheres */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/3 right-10 w-[350px] h-[350px] bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 left-10 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 border border-indigo-500/20 text-indigo-300 text-xs sm:text-sm font-semibold mb-6 animate-pulse-subtle">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Multiplayer Social Challenge • 2026 Edition</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight sm:leading-[1.1]">
              Turn Any Gathering Into A{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
                Legendary Quiz Battle
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              You choose a friend. You pick their topic. AI crafts an impossible, hilarious, or brilliant challenge question. Will they survive your test?
            </p>

            {/* Quick Join Input Box */}
            <div className="mt-10 max-w-xl mx-auto">
              <form onSubmit={handleQuickJoin} className="relative">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-2 rounded-2xl bg-background-card/90 border border-background-border shadow-2xl backdrop-blur-xl">
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => {
                      setJoinInput(e.target.value);
                      setInputError('');
                    }}
                    placeholder="Paste your invitation or challenge link here..."
                    className="flex-1 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none min-h-[44px]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all min-h-[44px]"
                  >
                    <span>Enter Game</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                {inputError && (
                  <p className="mt-2 text-xs text-rose-400 font-medium text-left px-2">
                    {inputError}
                  </p>
                )}
              </form>

              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
                <span>Received via WhatsApp? Just click your link directly!</span>
              </div>
            </div>

            {/* Quick Action Badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={() => navigate('/admin/login')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-sm transition-all min-h-[44px]"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Host a Game as Admin</span>
              </button>

              <button
                onClick={() => navigate('/admin')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-semibold text-sm transition-all min-h-[44px]"
              >
                <Zap className="w-4 h-4 text-indigo-400" />
                <span>Explore Live Demo Game</span>
              </button>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 sm:py-24 bg-background-darker/60 border-t border-background-border/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-20">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
                Simple & Addictive Gameplay
              </h2>
              <p className="text-3xl sm:text-4xl font-extrabold text-white">
                How Friday Fun 2026 Works
              </p>
              <p className="mt-3 text-slate-400 text-sm sm:text-base">
                No accounts needed for players. Just click, pick, challenge, and watch the chaos unfold!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {/* Step 1 */}
              <div className="p-6 rounded-2xl bg-background-card border border-background-border hover:border-indigo-500/30 transition-all group flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-indigo-400 mb-1">STEP 1</div>
                <h3 className="text-lg font-bold text-white mb-2">Join via Personal Link</h3>
                <p className="text-sm text-slate-400 leading-relaxed flex-1">
                  Host generates unique WhatsApp links for each participant. Open your link to enter the private room.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-6 rounded-2xl bg-background-card border border-background-border hover:border-purple-500/30 transition-all group flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform">
                  <Target className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-purple-400 mb-1">STEP 2</div>
                <h3 className="text-lg font-bold text-white mb-2">Target a Friend & Topic</h3>
                <p className="text-sm text-slate-400 leading-relaxed flex-1">
                  Select who to challenge and pick a topic from Politics, Kerala, AI, Sports, Cinema, Office Life, and more.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-6 rounded-2xl bg-background-card border border-background-border hover:border-cyan-500/30 transition-all group flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
                  <Share2 className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-cyan-400 mb-1">STEP 3</div>
                <h3 className="text-lg font-bold text-white mb-2">AI Generates Quiz</h3>
                <p className="text-sm text-slate-400 leading-relaxed flex-1">
                  Our AI immediately crafts a custom 4-option challenge. Send the WhatsApp challenge link to your target!
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-6 rounded-2xl bg-background-card border border-background-border hover:border-amber-500/30 transition-all group flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
                  <Trophy className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-amber-400 mb-1">STEP 4</div>
                <h3 className="text-lg font-bold text-white mb-2">Grand Answer Reveal</h3>
                <p className="text-sm text-slate-400 leading-relaxed flex-1">
                  Once everyone locks their answer, the Admin triggers the live reveal, calculates points, and crowns the champ!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl bg-gradient-to-b from-indigo-950/40 via-background-card to-background-card border border-indigo-500/20 p-8 sm:p-12 lg:p-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-bold mb-4">
                    <Zap className="w-3.5 h-3.5" />
                    BUILT FOR REAL-TIME EXCITEMENT
                  </div>
                  <h3 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                    Zero Setup Friction. Maximum Fun.
                  </h3>
                  <ul className="mt-6 space-y-4 text-sm sm:text-base text-slate-300">
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        ✓
                      </div>
                      <span><strong>Cryptographic Links:</strong> Each player and challenge gets an unguessable private token stored safely with SHA-256 hashes.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        ✓
                      </div>
                      <span><strong>One-Tap WhatsApp Sharing:</strong> Pre-filled emojis and challenge invites formatted for immediate viral fun.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        ✓
                      </div>
                      <span><strong>Server-Side RLS Protection:</strong> Correct answers are never exposed to clients until Admin authorization.</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 rounded-2xl bg-background/80 border border-slate-800 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-mono text-slate-400">STATUS: LIVE CHALLENGE</span>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Active Round
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-xs font-semibold text-purple-400">Topic: Kerala & Current Affairs</span>
                    <p className="text-sm font-bold text-white mt-1">
                      "Which city in Kerala was officially declared India's first UNESCO City of Literature?"
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300">A. Thiruvananthapuram</div>
                      <div className="p-2.5 rounded-lg bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 font-bold">
                        B. Kozhikode ★
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300">C. Kochi</div>
                      <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300">D. Thrissur</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-background-border/80 bg-background-darker py-8 text-center text-xs text-slate-500">
        <p>Friday Fun 2026 • Multiplayer Challenge & Quiz Game</p>
        <p className="mt-1">Crafted with React, Tailwind CSS, Supabase & AI</p>
      </footer>
    </div>
  );
};

