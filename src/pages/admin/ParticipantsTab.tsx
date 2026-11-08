import React, { useMemo, useState } from 'react';
import { Users, Plus, Search, Edit2, Trash2, RefreshCw, AlertTriangle, KeyRound } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { CopyButton } from '../../components/CopyButton';
import { gameService } from '../../services/gameService';
import { isLocalOrigin } from '../../lib/supabase';
import { Participant } from '../../types';
import { buildInvitationUrl, generateInvitationWhatsAppUrl, getBaseUrl } from '../../utils/sharing';
import { AdminData } from './useAdminData';
import { EmptyState, ErrorBox, Modal, ghostBtn, inputCls, labelCls, primaryBtn } from './ui';

export const ParticipantsTab: React.FC<{ d: AdminData }> = ({ d }) => {
  const g = d.selectedGame;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);

  const finished = g ? ['completed', 'cancelled'].includes(g.status) : true;

  const list = useMemo(
    () =>
      d.participants.filter(
        (p) =>
          (statusFilter === 'all' || p.status === statusFilter) &&
          (p.display_name.toLowerCase().includes(search.toLowerCase()) || p.player_code.toLowerCase().includes(search.toLowerCase()))
      ),
    [d.participants, search, statusFilter]
  );

  const nextCode = () => {
    const used = new Set(d.participants.map((p) => p.player_code.toUpperCase()));
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
    for (let i = 1; i < 1000; i++) if (!used.has(`P${i}`)) return `P${i}`;
    return '';
  };

  const remove = (p: Participant) =>
    d.askConfirm({
      title: `Remove ${p.display_name}?`,
      tone: 'danger',
      confirmLabel: 'Remove participant',
      body: (
        <>
          <p>
            <strong className="text-white">{p.display_name}</strong> (code {p.player_code}) will be removed from <strong>{g?.name}</strong> and their invitation link stops working.
          </p>
          <p className="text-slate-400">Participants who already have challenges cannot be removed – the server refuses it so other players keep their data.</p>
        </>
      ),
      onConfirm: async () => {
        await d.run(`rm:${p.id}`, async () => { await gameService.removeParticipant(p.id); await d.refresh({ quiet: true }); }, `${p.display_name} was removed.`);
      },
    });

  const regenerate = (p: Participant) =>
    d.askConfirm({
      title: `Regenerate ${p.display_name}'s link?`,
      tone: 'warning',
      confirmLabel: 'Regenerate link',
      body: <p>The current invitation link for <strong className="text-white">{p.display_name}</strong> stops working immediately. You must send them the new link.</p>,
      onConfirm: async () => {
        await d.run(`regen:${p.id}`, async () => { await gameService.regenerateInvitation(p.id); await d.refresh({ quiet: true }); }, `New invitation link issued for ${p.display_name}.`);
      },
    });

  if (!g) return <EmptyState title="No game selected" hint="Create or select a game first." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Participant Roster</h2>
          <p className="text-xs text-slate-400">
            {g.name} · {d.participants.length} / {g.settings.max_participants} participants (min {g.settings.min_participants}). Each gets a unique invitation link.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" aria-label="Search participants" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search participant…" className="w-full bg-background-card border border-background-border rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none min-h-[44px]" />
          </div>
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background-card border border-background-border rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[44px]">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="joined">Joined</option>
            <option value="selected">Challenge sent</option>
            <option value="completed">Completed</option>
          </select>
          <button type="button" disabled={finished} onClick={() => setShowAdd(true)} className={primaryBtn} data-testid="add-participant">
            <Plus className="w-4 h-4" />
            <span>Add Participant</span>
          </button>
        </div>
      </div>

      {isLocalOrigin() && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs" role="note">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            You opened the dashboard from <strong>{getBaseUrl()}</strong>. Links copied now only work on this computer. Open the admin from your deployed domain
            (or set <code>VITE_PUBLIC_BASE_URL</code>) before sharing links.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((p) => {
          const url = p.raw_invitation_token ? buildInvitationUrl(p.game_id, p.raw_invitation_token) : null;
          return (
            <div key={p.id} data-testid={`participant-${p.display_name}`} className="p-5 rounded-2xl bg-background-card border border-background-border flex flex-col justify-between hover:border-slate-700 transition-all">
              <div>
                <div className="flex items-start justify-between mb-4 gap-2">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <PlayerAvatar displayName={p.display_name} playerCode={p.player_code} size="md" />
                    <div className="min-w-0">
                      <h4 className="text-base font-extrabold text-white leading-tight truncate">{p.display_name}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">Player Code: <strong className="text-indigo-400">{p.player_code}</strong></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" disabled={finished} onClick={() => setEditing(p)} className="text-slate-500 hover:text-indigo-400 transition-colors rounded-lg disabled:opacity-40 min-h-[40px] min-w-[40px] inline-flex items-center justify-center" title="Edit participant" aria-label={`Edit ${p.display_name}`}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(p)} className="text-slate-500 hover:text-rose-400 transition-colors rounded-lg min-h-[40px] min-w-[40px] inline-flex items-center justify-center" title="Remove participant" aria-label={`Remove ${p.display_name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  <Badge variant={p.status === 'completed' ? 'success' : p.status === 'selected' ? 'purple' : p.status === 'joined' ? 'cyan' : 'neutral'} size="sm">
                    {p.status === 'selected' ? 'CHALLENGE SENT' : p.status.toUpperCase()}
                  </Badge>
                  {p.email_or_contact && <span className="ml-2 text-[11px] text-slate-500">{p.email_or_contact}</span>}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-background-border">
                {url ? (
                  <>
                    <p className="text-[10px] font-mono text-slate-500 break-all select-all" data-testid={`invite-url-${p.display_name}`}>{url}</p>
                    <WhatsAppButton url={generateInvitationWhatsAppUrl(p.display_name, url)} label="Share on WhatsApp" fullWidth size="sm" />
                    <CopyButton textToCopy={url} label="Copy Invite Link" fullWidth size="sm" />
                  </>
                ) : (
                  <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                    This invitation was created before secure links were stored, so it cannot be re-copied. Regenerate to issue a fresh link.
                  </div>
                )}
                {!finished && (
                  <button type="button" onClick={() => regenerate(p)} disabled={d.busy.has(`regen:${p.id}`)} className={`${ghostBtn} w-full text-xs min-h-[38px]`}>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{url ? 'Regenerate link' : 'Generate new link'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {d.participants.length === 0 && (
        <EmptyState icon={<Users className="w-12 h-12 text-slate-600 mx-auto" />} title="No participants yet" hint="Add players like A – Arun, B – Rahul to start inviting them." />
      )}
      {d.participants.length > 0 && list.length === 0 && <EmptyState title="No participants match your search" />}

      {showAdd && <AddParticipantModal d={d} gameId={g.id} defaultCode={nextCode()} onClose={() => setShowAdd(false)} />}
      {editing && <EditParticipantModal d={d} p={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const AddParticipantModal: React.FC<{ d: AdminData; gameId: string; defaultCode: string; onClose: () => void }> = ({ d, gameId, defaultCode, onClose }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(defaultCode);
  const [contact, setContact] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Participant name cannot be empty.');
    if (saving) return; // double-click guard
    setSaving(true);
    try {
      const r = await gameService.addParticipant(gameId, name, code || defaultCode, contact);
      await d.refresh({ quiet: true });
      onClose();
      d.flash('success', `Participant ${r.displayName} (code ${r.playerCode}) added with a unique invitation link.`);
    } catch (e: any) {
      setErr(e.message || 'Failed to add participant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Participant" subtitle="A secure, unguessable invitation link is generated on the server." testId="add-participant-modal">
      <ErrorBox message={err} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="ap-name">Participant Name *</label>
          <input id="ap-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Amal" autoFocus />
        </div>
        <div>
          <label className={labelCls} htmlFor="ap-code">Player Code (1–4 letters/digits)</label>
          <input id="ap-code" className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={4} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ap-contact">Phone / WhatsApp (optional)</label>
          <input id="ap-contact" className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryBtn} data-testid="add-participant-submit">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{saving ? 'Creating…' : 'Create Invitation'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

const EditParticipantModal: React.FC<{ d: AdminData; p: Participant; onClose: () => void }> = ({ d, p, onClose }) => {
  const [name, setName] = useState(p.display_name);
  const [code, setCode] = useState(p.player_code);
  const [contact, setContact] = useState(p.email_or_contact || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Participant name cannot be empty.');
    if (saving) return;
    setSaving(true);
    try {
      await gameService.updateParticipant(p.id, { displayName: name, playerCode: code, contact });
      await d.refresh({ quiet: true });
      onClose();
      d.flash('success', 'Participant updated. Their invitation link is unchanged.');
    } catch (e: any) {
      setErr(e.message || 'Failed to update participant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Participant" subtitle="The invitation link keeps working." testId="edit-participant-modal">
      <ErrorBox message={err} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="ep-name">Display Name *</label>
          <input id="ep-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ep-code">Player Code *</label>
          <input id="ep-code" className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={4} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ep-contact">Phone / WhatsApp</label>
          <input id="ep-contact" className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryBtn} data-testid="edit-participant-save">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </Modal>
  );
};
