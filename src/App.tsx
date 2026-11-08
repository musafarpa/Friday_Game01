import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { HomePage } from './pages/HomePage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ParticipantJoinPage } from './pages/ParticipantJoinPage';
import { ChallengeQuizPage } from './pages/ChallengeQuizPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { isSupabaseConfigured } from './lib/supabase';

/** Shown instead of the app when the deployment has no backend configured (never a silent demo mode). */
const ConfigurationError: React.FC = () => (
  <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
    <div className="max-w-lg w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl" role="alert" data-testid="config-error">
      <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
      <h1 className="text-xl font-bold text-white">Friday Fun is not configured</h1>
      <p className="text-sm text-slate-300 mt-2">
        This deployment is missing its database connection. The site owner must set <code className="text-rose-300">VITE_SUPABASE_URL</code> and{' '}
        <code className="text-rose-300">VITE_SUPABASE_PUBLISHABLE_KEY</code> in the hosting environment and redeploy.
      </p>
    </div>
  </div>
);

export const App: React.FC = () => {
  if (!isSupabaseConfigured) return <ConfigurationError />;
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<HomePage />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Participant Welcome & Selection */}
        <Route path="/join/:gameId/:token" element={<ParticipantJoinPage />} />

        {/* Challenge / Quiz Flow */}
        <Route path="/challenge/:challengeToken" element={<ChallengeQuizPage />} />

        {/* Public / Game Leaderboard & Results */}
        <Route path="/leaderboard/:gameId" element={<LeaderboardPage />} />
        <Route path="/results/:gameId" element={<LeaderboardPage />} />

        {/* Fallback to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
