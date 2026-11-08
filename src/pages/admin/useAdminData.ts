import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService, friendlyError } from '../../services/gameService';
import {
  Assignment,
  DefaultRules,
  Game,
  GameRound,
  GameTopicProgress,
  LeaderboardPayload,
  Participant,
  Topic,
  TopicStats,
} from '../../types';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export type Banner = { type: 'success' | 'error' | 'warning'; message: string } | null;

export interface ConfirmRequest {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary' | 'warning';
  onConfirm: () => Promise<void> | void;
}

export interface Totals {
  participantsAll: number;
  challengesAll: number;
}

/**
 * Single source of truth for the dashboard. Everything comes from Supabase; nothing is cached in
 * localStorage. `refresh()` always reads the CURRENT selection from a ref, so switching games can
 * never reload the previously-selected game (the stale-closure bug in the old dashboard).
 */
export function useAdminData() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [games, setGames] = useState<Game[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [round, setRound] = useState<GameRound | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicStats, setTopicStats] = useState<Record<string, TopicStats>>({});
  const [pool, setPool] = useState<GameTopicProgress[]>([]);
  const [defaultRules, setDefaultRules] = useState<DefaultRules>({ min_participants: 3, max_participants: 30, points_correct: 10, points_wrong: 0 });
  const [totals, setTotals] = useState<Totals>({ participantsAll: 0, challengesAll: 0 });
  const [realtime, setRealtime] = useState<string>('connecting');

  const [banner, setBanner] = useState<Banner>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const selectedIdRef = useRef<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

  const selectedGame = useMemo(() => games.find((g) => g.id === selectedId) ?? null, [games, selectedId]);

  const flash = useCallback((type: 'success' | 'error' | 'warning', message: string, ms = type === 'error' ? 9000 : 4500) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, message });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  /** Load everything for the CURRENT selection. Safe to call repeatedly (stale responses are dropped). */
  const refresh = useCallback(
    async (opts: { quiet?: boolean; gameId?: string | null } = {}) => {
      const seq = ++loadSeq.current;
      if (!opts.quiet) setLoading(true);
      try {
        const [allGames, allTopics, stats, rules] = await Promise.all([
          gameService.getGames(),
          gameService.getAllTopics(),
          gameService.getTopicStats().catch(() => ({} as Record<string, TopicStats>)),
          gameService.getDefaultRules().catch(() => null),
        ]);
        if (seq !== loadSeq.current) return;

        let target = opts.gameId !== undefined ? opts.gameId : selectedIdRef.current;
        if (!target || !allGames.some((g) => g.id === target)) target = allGames[0]?.id ?? null;
        selectedIdRef.current = target;

        setGames(allGames);
        setTopics(allTopics);
        setTopicStats(stats);
        if (rules) setDefaultRules(rules);
        setSelectedIdState(target);

        const [pAll, cAll] = await Promise.all([
          supabase.from('participants').select('id', { count: 'exact', head: true }),
          supabase.from('assignments').select('id', { count: 'exact', head: true }),
        ]);
        if (seq !== loadSeq.current) return;
        setTotals({ participantsAll: pAll.count ?? 0, challengesAll: cAll.count ?? 0 });

        if (target) {
          const [parts, rnd, assigns, board, progress] = await Promise.all([
            gameService.getParticipants(target),
            gameService.getActiveRound(target),
            gameService.getLiveAssignments(target),
            gameService.getLeaderboard(target),
            gameService.getGameTopicProgress(target),
          ]);
          if (seq !== loadSeq.current || selectedIdRef.current !== target) return;
          setParticipants(parts);
          setRound(rnd);
          setAssignments(assigns);
          setLeaderboard(board);
          setPool(progress);
        } else {
          setParticipants([]);
          setRound(null);
          setAssignments([]);
          setLeaderboard(null);
          setPool([]);
        }
        setLoadError('');
      } catch (err: any) {
        if (seq === loadSeq.current) setLoadError(friendlyError(err, 'Failed to load dashboard data.'));
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    []
  );

  const selectGame = useCallback(
    (id: string) => {
      selectedIdRef.current = id;
      setSelectedIdState(id);
      // clear game-scoped data immediately so the previous game's roster is never shown/copied
      setParticipants([]);
      setAssignments([]);
      setLeaderboard(null);
      setPool([]);
      setRound(null);
      void refresh({ gameId: id });
    },
    [refresh]
  );

  /** Runs an action with a per-key lock (blocks double-clicks) and uniform error reporting. */
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, successMessage?: string | ((r: T) => string)): Promise<T | undefined> => {
      if (busy.has(key)) return undefined;
      setBusy((s) => new Set(s).add(key));
      try {
        const result = await fn();
        if (successMessage) flash('success', typeof successMessage === 'function' ? successMessage(result) : successMessage);
        return result;
      } catch (err: any) {
        flash('error', friendlyError(err));
        return undefined;
      } finally {
        setBusy((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [busy, flash]
  );

  const askConfirm = useCallback((req: ConfirmRequest) => setConfirm(req), []);

  // ---- auth gate + session expiry
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured) {
        navigate('/admin/login', { replace: true });
        return;
      }
      const ok = await gameService.checkIsAdmin();
      if (cancelled) return;
      if (!ok) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setCheckingAuth(false);
      void refresh();
    })();
    const off = gameService.onAdminSessionEnded(() => navigate('/admin/login', { replace: true }));
    // Re-verify periodically so an expired/revoked session is caught even while idle.
    const iv = setInterval(async () => {
      if (!(await gameService.checkIsAdmin())) navigate('/admin/login', { replace: true });
    }, 5 * 60_000);
    return () => {
      cancelled = true;
      off();
      clearInterval(iv);
    };
  }, [navigate, refresh]);

  // ---- realtime for the selected game (admin tables, filtered by the admin JWT through RLS)
  useEffect(() => {
    if (!selectedId || checkingAuth) return;
    const off = gameService.subscribeToGameUpdates(selectedId, () => void refresh({ quiet: true }), {
      mode: 'admin',
      onStatus: setRealtime,
    });
    return off;
  }, [selectedId, checkingAuth, refresh]);

  return {
    navigate,
    checkingAuth,
    loading,
    loadError,
    games,
    selectedGame,
    selectedId,
    participants,
    assignments,
    leaderboard,
    round,
    topics,
    topicStats,
    pool,
    setPool,
    defaultRules,
    setDefaultRules,
    totals,
    realtime,
    banner,
    flash,
    confirm,
    setConfirm,
    askConfirm,
    busy,
    run,
    refresh,
    selectGame,
  };
}

export type AdminData = ReturnType<typeof useAdminData>;
