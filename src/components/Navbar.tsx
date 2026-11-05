import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gamepad2, Shield, Menu, X, LogOut, Trophy, Sparkles } from 'lucide-react';
import { gameService } from '../services/gameService';

interface NavbarProps {
  isAdmin?: boolean;
  onAdminLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isAdmin = false, onAdminLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await gameService.logoutAdmin();
    if (onAdminLogout) {
      onAdminLogout();
    }
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-background-border/80 bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group focus:outline-none">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-500 p-[2px] shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#111726] rounded-[10px] flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-indigo-400 group-hover:text-cyan-400 transition-colors" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                  FRIDAY FUN
                </span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  2026
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden sm:block">
                Multiplayer Quiz Challenge
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              How It Works
            </Link>

            {isAdmin ? (
              <>
                <Link
                  to="/admin"
                  className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Shield className="w-4 h-4" />
                  Admin Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                to="/admin/login"
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 min-h-[44px]"
              >
                <Shield className="w-4 h-4 text-indigo-400" />
                Admin Portal
              </Link>
            )}
          </nav>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl border border-background-border bg-background-card text-slate-300 hover:text-white focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-background-border bg-background-card/95 backdrop-blur-xl px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-3">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-3 rounded-lg text-slate-200 hover:bg-background-hover min-h-[44px]"
          >
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-medium text-sm">Game Overview</span>
          </Link>

          {isAdmin ? (
            <>
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-3 rounded-lg text-indigo-300 hover:bg-background-hover min-h-[44px]"
              >
                <Shield className="w-5 h-5 text-indigo-400" />
                <span className="font-medium text-sm">Admin Dashboard</span>
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-lg text-rose-400 hover:bg-rose-500/10 min-h-[44px]"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium text-sm">Sign Out Admin</span>
              </button>
            </>
          ) : (
            <Link
              to="/admin/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-3 rounded-lg text-slate-300 hover:bg-background-hover min-h-[44px]"
            >
              <Shield className="w-5 h-5 text-indigo-400" />
              <span className="font-medium text-sm">Admin Login</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
};
