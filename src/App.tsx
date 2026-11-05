import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ParticipantJoinPage } from './pages/ParticipantJoinPage';
import { ChallengeQuizPage } from './pages/ChallengeQuizPage';
import { LeaderboardPage } from './pages/LeaderboardPage';

export const App: React.FC = () => {
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

        {/* Public / Game Leaderboard */}
        <Route path="/leaderboard/:gameId" element={<LeaderboardPage />} />

        {/* Fallback to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
