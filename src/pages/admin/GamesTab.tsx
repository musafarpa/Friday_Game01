import React, { useEffect, useState } from 'react';
import { Gamepad2, Plus, Edit2, Trash2, RefreshCw, Play, Pause, XCircle, CheckCircle2, Eye, Lock, Sparkles } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { gameService } from '../../services/gameService';
import { Game, GameTopicProgress } from '../../types';
import { AdminData } from './useAdminData';
import { useGameActions } from './actions';
import { ErrorBox, Modal, StatusBadge, ghostBtn, inputCls, labelCls, primaryBtn } from './ui';

const pre = (s: string) => ['draft', 'registration_open', 'ready'].includes(s);

export const GamesTab: React.FC<{ d: AdminData; setTab: (t: any) => void; createSignal?: number }> = ({ d, setTab, createSignal }) => {
  const actions = useGameActions(d);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  useEffect(() => {
    if (createSignal) setShowCreate(true);
  }, [createSignal]);

  const runCleanup = () =>
    d.askConfirm({
      title: 'Run retention cleanup?',
      tone: 'warning',
      confirmLabel: 'Run cleanup',
      body: (
        <>
          <p>
            Permanently deletes <strong>completed</strong> and <strong>cancelled</strong> games that finished more than <strong>24 hours</strong> ago.
          </p>
          <p className="text-slate-400">Draft, registration-open, in-progress and paused games are never touched.</p>
        </>
      ),
      onConfirm: async () => {
        setCleanupBusy(true);
        await d.run(
          'cleanup',
          async () => {
            const r = await gameService.cleanupFinishedGames(24);
            await d.refresh({ quiet: true });
            return r;
          },
          (r) =>
            r.cleaned_count === 0
              ? 'Cleanup finished: nothing to remove.'
              : `Cleanup removed ${r.cleaned_count} game(s): ${r.games.map((x) => x.name).join(', ')}.`
        );
        setCleanupBusy(false);
      },
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Game Rooms Management</h2>
          <p className="text-xs text-slate-400">Create, configure, start, pause, complete, cancel or delete game rooms.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => d.refresh()} className={ghostBtn} data-testid="games-refresh">
            <RefreshCw className={`w-4 h-4 ${d.loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button type="button" onClick={runCleanup} disabled={cleanupBusy} className={ghostBtn} data-testid="games-cleanup">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>Retention Cleanup</span>
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className={primaryBtn} data-testid="games-create">
            <Plus className="w-4 h-4" />
            <span>Create New Game</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {d.games.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-2xl bg-background-card border border-background-border">
            <Gamepad2 className="w-12 h-12 text-indigo-400/50 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No Game Rooms Yet</h3>
            <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">Click below to create your first game room.</p>
            <button type="button" onClick={() => setShowCreate(true)} className={primaryBtn}>
              <Plus className="w-4 h-4" />
              <span>Create Your First Game</span>
            </button>
          </div>
        ) : (
          d.games.map((g) => {
            const selected = d.selectedGame?.id === g.id;
            const b = (a: string) => d.busy.has(`${a}:${g.id}`);
            const checklist = selected && pre(g.status);
            const minP = g.settings?.min_participants ?? 3;
            const poolReady = d.pool.length > 0 && d.pool.every((t) => t.status === 'complete');
            return (
              <div
                key={g.id}
                data-testid={`game-card-${g.name}`}
                className={`p-5 sm:p-6 rounded-2xl border transition-all ${selected ? 'bg-background-card border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-background-card border-background-border'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white break-words">{g.name}</h3>
                      <StatusBadge status={g.status} />
                      {selected && <Badge variant="primary" size="sm">SELECTED</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{g.description || 'No description provided.'}</p>
                  </div>
                  {!['completed', 'cancelled'].includes(g.status) && (
                    <button type="button" onClick={() => setEditing(g)} className="p-2 rounded-lg border border-background-border hover:bg-background-hover text-slate-400 hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center" title="Edit game" aria-label={`Edit ${g.name}`}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-background-border text-center text-xs">
                  <div>
                    <span className="text-slate-500 block">Min / Max</span>
                    <strong className="text-slate-200">{g.settings.min_participants} / {g.settings.max_participants}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Points</span>
                    <strong className="text-indigo-400">+{g.settings.points_correct}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Date</span>
                    <strong className="text-slate-300">{g.game_date}</strong>
                  </div>
                </div>

                {checklist && (
                  <ul className="mt-3 text-[11px] space-y-1" aria-label="Start requirements">
                    <li className={d.participants.length >= minP ? 'text-emerald-400' : 'text-amber-300'}>
                      {d.participants.length >= minP ? '✓' : '✗'} Participants: {d.participants.length} / {minP} minimum
                    </li>
                    <li className={poolReady ? 'text-emerald-400' : 'text-amber-300'}>
                      {poolReady ? '✓' : '✗'} Question pools: {d.pool.filter((t) => t.status === 'complete').length} / {d.pool.length} topics have ≥7 valid questions (3E/3M/1H)
                    </li>
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {g.status === 'draft' && (
                    <button type="button" disabled={b('open_registration')} onClick={() => actions.openRegistration(g)} className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-xs font-bold min-h-[40px] disabled:opacity-50">
                      Open Registration
                    </button>
                  )}
                  {pre(g.status) && (
                    <button type="button" disabled={b('start')} onClick={() => actions.start(g)} data-testid={`start-${g.name}`} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <Play className="w-3.5 h-3.5" />
                      <span>{b('start') ? 'Starting…' : 'Start Game'}</span>
                    </button>
                  )}
                  {g.status === 'active' && (
                    <button type="button" disabled={b('pause')} onClick={() => actions.pause(g)} className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  )}
                  {(g.status === 'paused' || g.status === 'waiting_for_answers') && (
                    <button type="button" disabled={b('resume')} onClick={() => actions.resume(g)} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  )}
                  {(g.status === 'active' || g.status === 'paused' || g.status === 'waiting_for_answers') && (
                    <button type="button" disabled={b('complete')} onClick={() => actions.complete(g)} data-testid={`complete-${g.name}`} className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </button>
                  )}
                  {!['completed', 'cancelled'].includes(g.status) && (
                    <button type="button" disabled={b('cancel')} onClick={() => actions.cancel(g)} data-testid={`cancel-${g.name}`} className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                  {['active', 'paused', 'waiting_for_answers'].includes(g.status) ? (
                    <span className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-500 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]" title="Cancel or complete the game before deleting it">
                      <Lock className="w-3.5 h-3.5" /> Delete (locked while in progress)
                    </span>
                  ) : (
                    <button type="button" disabled={b('delete')} onClick={() => actions.remove(g)} data-testid={`delete-${g.name}`} className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!selected) d.selectGame(g.id);
                      setTab('overview');
                    }}
                    className="ml-auto text-xs text-indigo-400 font-bold hover:underline inline-flex items-center gap-1 min-h-[40px]"
                    data-testid={`view-${g.name}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> {selected ? 'View details' : 'Select & view'} →
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showCreate && <CreateGameModal d={d} onClose={() => setShowCreate(false)} />}
      {editing && <EditGameModal d={d} game={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const CreateGameModal: React.FC<{ d: AdminData; onClose: () => void }> = ({ d, onClose }) => {
  const activeTopics = d.topics.filter((t) => t.is_active);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [min, setMin] = useState(d.defaultRules.min_participants);
  const [max, setMax] = useState(d.defaultRules.max_participants);
  const [pts, setPts] = useState(d.defaultRules.points_correct);
  const [ptsWrong, setPtsWrong] = useState(d.defaultRules.points_wrong);
  const [status, setStatus] = useState<'registration_open' | 'draft'>('registration_open');
  const [picked, setPicked] = useState<string[]>(activeTopics.map((t) => t.id));
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<GameTopicProgress[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Game name cannot be empty.');
    if (picked.length === 0) return setErr('Select at least 1 topic for this game.');
    if (min < 2) return setErr('Minimum participants must be at least 2.');
    if (max < min) return setErr('Maximum participants cannot be less than minimum participants.');
    if (pts < 1) return setErr('Points per correct answer must be at least 1.');
    if (working) return;
    setWorking(true);
    let created: Game | null = null;
    try {
      created = await gameService.createGame({
        name,
        description: desc,
        rules: { min_participants: min, max_participants: max, points_correct: pts, points_wrong: ptsWrong },
        topicIds: picked,
        initialStatus: status,
      });
      const res = await gameService.generateQuestionPoolForGame(created.id, picked, setProgress);
      await d.refresh({ quiet: true, gameId: created.id });
      onClose();
      if (res.success) d.flash('success', `Game "${created.name}" created with a complete question pool for ${picked.length} topic(s).`);
      else d.flash('warning', `Game "${created.name}" created, but some topics need more questions before it can start. ${res.warnings.slice(0, 2).join(' ')}`);
    } catch (e: any) {
      if (created) {
        // the game exists - don't leave the admin guessing
        await d.refresh({ quiet: true, gameId: created.id });
        onClose();
        d.flash('warning', `Game "${created.name}" was created, but question generation failed: ${e.message}. Use "Top Up All Topics" on the Overview tab.`);
      } else {
        setErr(e.message || 'Error creating game');
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal title="Create New Game" subtitle="Launch a new Friday Fun room. Questions are generated per topic (minimum 7 each)." wide testId="create-game-modal">
      <ErrorBox message={err} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="cg-name">Game Name *</label>
          <input id="cg-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Friday Fun 2026 – Sprint Celebration" disabled={working} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cg-desc">Description</label>
          <input id="cg-desc" className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} placeholder="Short description (optional)" disabled={working} />
        </div>

        <fieldset disabled={working}>
          <div className="flex items-center justify-between mb-1.5">
            <legend className={labelCls}>Topics * ({picked.length} selected)</legend>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <button type="button" onClick={() => setPicked(activeTopics.map((t) => t.id))} className="text-indigo-400 hover:text-indigo-300 min-h-[40px] px-2 inline-flex items-center">Select All</button>
              <span className="text-slate-600">•</span>
              <button type="button" onClick={() => setPicked([])} className="text-slate-400 hover:text-slate-300 min-h-[40px] px-2 inline-flex items-center">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2.5 bg-background-darker border border-background-border rounded-xl">
            {activeTopics.length === 0 && <p className="text-xs text-amber-300 col-span-full">No active topics. Enable or add a topic first.</p>}
            {activeTopics.map((t) => {
              const on = picked.includes(t.id);
              return (
                <label key={t.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs border min-h-[40px] ${on ? 'bg-indigo-600/15 border-indigo-500/40 text-white font-semibold' : 'border-transparent text-slate-400 hover:bg-background-hover'}`}>
                  <input type="checkbox" checked={on} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} className="rounded border-slate-700" />
                  <span className="truncate">{t.name}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2.5 p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs flex items-center justify-between gap-2 flex-wrap">
            <span className="text-indigo-300 font-bold">Minimum questions required</span>
            <span className="text-white font-mono bg-indigo-600/40 px-2 py-0.5 rounded-md border border-indigo-500/30" data-testid="min-questions-calc">
              {picked.length} topics × 7 = {picked.length * 7} questions
            </span>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cg-min">Min Players</label>
            <input id="cg-min" type="number" min={2} max={100} className={inputCls} value={min} onChange={(e) => setMin(parseInt(e.target.value) || 0)} disabled={working} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cg-max">Max Players</label>
            <input id="cg-max" type="number" min={2} max={100} className={inputCls} value={max} onChange={(e) => setMax(parseInt(e.target.value) || 0)} disabled={working} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cg-pts">Points / Correct</label>
            <input id="cg-pts" type="number" min={1} max={100} className={inputCls} value={pts} onChange={(e) => setPts(parseInt(e.target.value) || 0)} disabled={working} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cg-status">Initial Status</label>
            <select id="cg-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as any)} disabled={working}>
              <option value="registration_open">Registration Open</option>
              <option value="draft">Save as Draft</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">The game starts only when you press “Start Game” and every start requirement is met.</p>

        {working && progress.length > 0 && (
          <ul className="text-[11px] space-y-1 p-3 rounded-xl bg-background-darker border border-background-border" aria-live="polite">
            {progress.map((p) => (
              <li key={p.topic_id} className="flex items-center justify-between gap-2">
                <span className="text-slate-300 truncate">{p.topic_name}</span>
                <span className={p.status === 'complete' ? 'text-emerald-400' : p.status === 'failed' ? 'text-rose-400' : 'text-amber-300'}>
                  {p.status === 'generating' ? 'generating…' : `${p.current_count}/${p.required_count}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={working} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={working} className={primaryBtn} data-testid="create-game-submit">
            {working && <RefreshCw className="w-4 h-4 animate-spin" />}
            <Sparkles className={`w-4 h-4 ${working ? 'hidden' : ''}`} />
            <span>{working ? 'Creating & generating questions…' : 'Create Game Room'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

const EditGameModal: React.FC<{ d: AdminData; game: Game; onClose: () => void }> = ({ d, game, onClose }) => {
  const locked = !pre(game.status);
  const [name, setName] = useState(game.name);
  const [desc, setDesc] = useState(game.description || '');
  const [min, setMin] = useState(game.settings.min_participants);
  const [max, setMax] = useState(game.settings.max_participants);
  const [pts, setPts] = useState(game.settings.points_correct);
  const [ptsWrong, setPtsWrong] = useState(game.settings.points_wrong ?? 0);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Game name cannot be empty.');
    if (!locked) {
      if (min < 2) return setErr('Minimum participants must be at least 2.');
      if (max < min) return setErr('Maximum participants cannot be less than minimum participants.');
    }
    if (saving) return;
    setSaving(true);
    try {
      await gameService.updateGame(game.id, {
        name,
        description: desc,
        rules: locked ? {} : { min_participants: min, max_participants: max, points_correct: pts, points_wrong: ptsWrong },
      });
      await d.refresh({ quiet: true });
      onClose();
      d.flash('success', 'Game updated.');
    } catch (e: any) {
      setErr(e.message || 'Error updating game');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Game" subtitle={locked ? 'Rules are locked once a game has started. Name and description can still be changed.' : undefined} wide testId="edit-game-modal">
      <ErrorBox message={err} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="eg-name">Game Name *</label>
          <input id="eg-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className={labelCls} htmlFor="eg-desc">Description</label>
          <input id="eg-desc" className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls} htmlFor="eg-min">Min Players</label>
            <input id="eg-min" type="number" min={2} className={inputCls} value={min} onChange={(e) => setMin(parseInt(e.target.value) || 0)} disabled={locked} />
          </div>
          <div>
            <label className={labelCls} htmlFor="eg-max">Max Players</label>
            <input id="eg-max" type="number" min={2} className={inputCls} value={max} onChange={(e) => setMax(parseInt(e.target.value) || 0)} disabled={locked} />
          </div>
          <div>
            <label className={labelCls} htmlFor="eg-pts">Points ✓</label>
            <input id="eg-pts" type="number" min={1} className={inputCls} value={pts} onChange={(e) => setPts(parseInt(e.target.value) || 0)} disabled={locked} />
          </div>
          <div>
            <label className={labelCls} htmlFor="eg-ptsw">Points ✗</label>
            <input id="eg-ptsw" type="number" max={0} className={inputCls} value={ptsWrong} onChange={(e) => setPtsWrong(parseInt(e.target.value) || 0)} disabled={locked} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryBtn} data-testid="edit-game-save">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </Modal>
  );
};
