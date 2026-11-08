import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { gameService } from '../../services/gameService';
import { DefaultRules } from '../../types';
import { AdminData } from './useAdminData';
import { EmptyState, ErrorBox, StatusBadge, inputCls, labelCls, primaryBtn } from './ui';

const RuleForm: React.FC<{
  value: DefaultRules;
  disabled?: boolean;
  onSave: (v: DefaultRules) => Promise<void>;
  saveLabel: string;
  testPrefix: string;
}> = ({ value, disabled, onSave, saveLabel, testPrefix }) => {
  const [v, setV] = useState(value);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(value), [value.min_participants, value.max_participants, value.points_correct, value.points_wrong]);

  const num = (k: keyof DefaultRules) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value === '' || e.target.value === '-' ? (0 as number) : parseInt(e.target.value, 10) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (v.min_participants < 2) return setErr('Minimum participants must be at least 2.');
    if (v.max_participants < v.min_participants) return setErr('Maximum participants cannot be less than minimum participants.');
    if (v.points_correct < 1 || v.points_correct > 100) return setErr('Points per correct answer must be between 1 and 100.');
    if (v.points_wrong > 0 || v.points_wrong < -100) return setErr('Points per wrong answer must be between -100 and 0.');
    if (saving) return;
    setSaving(true);
    try {
      await onSave(v);
    } catch (e: any) {
      setErr(e.message || 'Could not save rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBox message={err} />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor={`${testPrefix}-min`}>Min Participants</label>
          <input id={`${testPrefix}-min`} type="number" min={2} max={100} className={inputCls} value={v.min_participants} onChange={num('min_participants')} disabled={disabled} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${testPrefix}-max`}>Max Participants</label>
          <input id={`${testPrefix}-max`} type="number" min={2} max={100} className={inputCls} value={v.max_participants} onChange={num('max_participants')} disabled={disabled} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${testPrefix}-pc`}>Points per Correct Answer</label>
          <input id={`${testPrefix}-pc`} type="number" min={1} max={100} className={inputCls} value={v.points_correct} onChange={num('points_correct')} disabled={disabled} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${testPrefix}-pw`}>Points per Wrong Answer</label>
          <input id={`${testPrefix}-pw`} type="number" min={-100} max={0} className={inputCls} value={v.points_wrong} onChange={num('points_wrong')} disabled={disabled} />
        </div>
      </div>
      {!disabled && (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryBtn} data-testid={`${testPrefix}-save`}>{saving ? 'Saving…' : saveLabel}</button>
        </div>
      )}
    </form>
  );
};

export const RulesTab: React.FC<{ d: AdminData }> = ({ d }) => {
  const g = d.selectedGame;
  const locked = g ? !['draft', 'registration_open', 'ready'].includes(g.status) : true;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Game Rules & Settings</h2>
        <p className="text-xs text-slate-400">Rules are stored per game. Changing the defaults below never alters games that already exist.</p>
      </div>

      {g ? (
        <section className="p-5 sm:p-6 rounded-2xl bg-background-card border border-background-border space-y-5" aria-label="Selected game rules">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{g.name}</h3>
            <StatusBadge status={g.status} />
          </div>
          {locked && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              <Lock className="w-3.5 h-3.5" /> Rules are locked once a game has started.
            </div>
          )}
          <RuleForm
            testPrefix="game-rules"
            value={{
              min_participants: g.settings.min_participants,
              max_participants: g.settings.max_participants,
              points_correct: g.settings.points_correct,
              points_wrong: g.settings.points_wrong ?? 0,
            }}
            disabled={locked}
            saveLabel="Save Game Rules"
            onSave={async (v) => {
              await gameService.updateGame(g.id, { name: g.name, description: g.description, rules: v });
              await d.refresh({ quiet: true });
              d.flash('success', `Rules saved for “${g.name}”.`);
            }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-background-darker border border-background-border">
              <span className="text-slate-500 block">Questions per challenge</span>
              <strong className="text-white text-base">7 (fixed)</strong>
            </div>
            <div className="p-3 rounded-xl bg-background-darker border border-background-border">
              <span className="text-slate-500 block">Difficulty mix</span>
              <strong className="text-base"><span className="text-emerald-400">3 Easy</span> · <span className="text-amber-400">3 Med</span> · <span className="text-rose-400">1 Hard</span></strong>
            </div>
            <div className="p-3 rounded-xl bg-background-darker border border-background-border">
              <span className="text-slate-500 block">Answers revealed</span>
              <strong className="text-white text-base">On completion</strong>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Challenge rule: each player sends one challenge (a friend + a topic) and may receive several. A receiver never gets the same question twice. Score = correct × {g.settings.points_correct}
            {g.settings.points_wrong ? `, wrong × ${g.settings.points_wrong}` : ''}; unanswered = 0.
          </p>
        </section>
      ) : (
        <EmptyState title="No game selected" hint="Select a game to view its rules." />
      )}

      <section className="p-5 sm:p-6 rounded-2xl bg-background-card border border-background-border space-y-4" aria-label="Default rules">
        <div>
          <h3 className="text-base font-bold text-white">Default rules for new games</h3>
          <p className="text-xs text-slate-400">Used to pre-fill “Create Game”. Existing games keep their own rules.</p>
        </div>
        <RuleForm
          testPrefix="default-rules"
          value={d.defaultRules}
          saveLabel="Save Defaults"
          onSave={async (v) => {
            const saved = await gameService.setDefaultRules(v);
            d.setDefaultRules({ ...v, ...(saved as any) });
            d.flash('success', 'Default rules saved. They apply to games created from now on.');
          }}
        />
      </section>
    </div>
  );
};
