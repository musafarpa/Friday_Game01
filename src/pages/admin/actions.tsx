import React from 'react';
import { gameService } from '../../services/gameService';
import { Game, GameAction } from '../../types';
import { AdminData } from './useAdminData';

/** Lifecycle actions with explicit confirmation, busy-locking and honest success/error reporting. */
export function useGameActions(d: AdminData) {
  const transition = (g: Game, action: GameAction, success: string) =>
    d.run(
      `${action}:${g.id}`,
      async () => {
        const r = await gameService.setGameStatus(g.id, action);
        await d.refresh({ quiet: true });
        return r;
      },
      success
    );

  const isSelected = (g: Game) => d.selectedGame?.id === g.id;

  const challengeSummary = (g: Game) => {
    if (!isSelected(g)) return null;
    const total = d.assignments.length;
    const done = d.assignments.filter((a) => a.status === 'submitted').length;
    const unanswered = d.assignments.reduce((n, a) => n + Math.max(0, (a.total_questions || 7) - (a.answers?.length || 0)), 0);
    return { total, done, unanswered };
  };

  return {
    openRegistration: (g: Game) => transition(g, 'open_registration', `Registration is open for "${g.name}".`),
    start: (g: Game) => transition(g, 'start', `"${g.name}" is now IN PROGRESS. Participants can start sending challenges.`),
    pause: (g: Game) => transition(g, 'pause', `"${g.name}" is paused. No new challenges or answers are accepted until you resume.`),
    resume: (g: Game) => transition(g, 'resume', `"${g.name}" resumed.`),

    complete: (g: Game) => {
      const s = challengeSummary(g);
      d.askConfirm({
        title: `Complete "${g.name}"?`,
        tone: 'warning',
        confirmLabel: 'Complete game & reveal',
        body: (
          <>
            <p>
              This <strong>closes the game</strong>, locks every answer, calculates final scores and{' '}
              <strong>reveals the correct answers</strong> to participants.
            </p>
            {s && (
              <p className="text-amber-300">
                {s.done} of {s.total} challenges are finished; {s.unanswered} unanswered question(s) will score 0.
              </p>
            )}
            <p className="text-slate-400">The game is kept (not deleted) and its results stay visible until cleanup.</p>
          </>
        ),
        onConfirm: async () => {
          await transition(g, 'complete', `"${g.name}" completed. Final scores are published.`);
        },
      });
    },

    cancel: (g: Game) =>
      d.askConfirm({
        title: `Cancel "${g.name}"?`,
        tone: 'danger',
        confirmLabel: 'Cancel game',
        body: (
          <>
            <p>
              Participants will see the game as <strong>cancelled</strong>. New challenges and answer submissions stop immediately and
              the game cannot be restarted.
            </p>
            <p className="text-slate-400">Existing records are preserved (cancelling does not delete anything).</p>
          </>
        ),
        onConfirm: async () => {
          await transition(g, 'cancel', `"${g.name}" was cancelled.`);
        },
      }),

    remove: (g: Game) => {
      const s = challengeSummary(g);
      d.askConfirm({
        title: `Delete "${g.name}" permanently?`,
        tone: 'danger',
        confirmLabel: 'Delete permanently',
        body: (
          <>
            <p>
              You are deleting the game <strong className="text-white">{g.name}</strong> (status: {g.status.replace(/_/g, ' ')}).
            </p>
            <p>
              All of its participants, invitation links, questions, challenges, answers and scores are removed and old links stop working.{' '}
              <strong>This cannot be undone.</strong>
            </p>
            {s && (
              <p className="text-slate-400">
                Currently: {d.participants.length} participant(s), {s.total} challenge(s).
              </p>
            )}
            <p className="text-slate-400">Other games are not affected.</p>
          </>
        ),
        onConfirm: async () => {
          await d.run(
            `delete:${g.id}`,
            async () => {
              const r = await gameService.deleteGame(g.id);
              await d.refresh({ quiet: true });
              return r;
            },
            (r) => `Game "${r.name}" deleted (${r.participants_removed} participants, ${r.challenges_removed} challenges removed).`
          );
        },
      });
    },
  };
}
