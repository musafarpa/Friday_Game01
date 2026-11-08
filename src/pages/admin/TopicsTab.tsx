import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { gameService } from '../../services/gameService';
import { Topic } from '../../types';
import { AdminData } from './useAdminData';
import { EmptyState, ErrorBox, Modal, ghostBtn, inputCls, labelCls, primaryBtn } from './ui';

export const TopicsTab: React.FC<{ d: AdminData }> = ({ d }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);

  const list = useMemo(
    () =>
      d.topics
        .filter((t) => filter === 'all' || (filter === 'active' ? t.is_active : !t.is_active))
        .filter((t) => `${t.name} ${t.description ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [d.topics, search, filter]
  );

  const toggle = (t: Topic) =>
    d.run(
      `topic-toggle:${t.id}`,
      async () => {
        await gameService.toggleTopic(t.id, !t.is_active);
        await d.refresh({ quiet: true });
      },
      t.is_active
        ? `“${t.name}” disabled. It can't be picked for new games; existing history is kept.`
        : `“${t.name}” enabled.`
    );

  const remove = (t: Topic) => {
    const s = d.topicStats[t.id];
    d.askConfirm({
      title: `Delete topic “${t.name}”?`,
      tone: 'danger',
      confirmLabel: 'Delete topic',
      body: (
        <>
          <p>
            This permanently removes the topic. {s && (s.games_using > 0 || s.challenges > 0)
              ? <strong className="text-amber-300">It is used by {s.games_using} game(s) and {s.challenges} challenge(s), so the server will refuse – disable it instead.</strong>
              : 'It is not used by any game.'}
          </p>
        </>
      ),
      onConfirm: async () => {
        await d.run(`topic-del:${t.id}`, async () => { await gameService.deleteTopic(t.id); await d.refresh({ quiet: true }); }, `Topic “${t.name}” deleted.`);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Topic Categories</h2>
          <p className="text-xs text-slate-400">{d.topics.filter((t) => t.is_active).length} active · {d.topics.filter((t) => !t.is_active).length} disabled. Disabled topics can't be chosen for new games.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" aria-label="Search topics" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics…" className="w-full bg-background-card border border-background-border rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none min-h-[44px]" />
          </div>
          <select aria-label="Filter topics" value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-background-card border border-background-border rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[44px]">
            <option value="all">All topics</option>
            <option value="active">Active only</option>
            <option value="disabled">Disabled only</option>
          </select>
          <button type="button" onClick={() => setShowAdd(true)} className={primaryBtn} data-testid="add-topic">
            <Plus className="w-4 h-4" />
            <span>Add Custom Topic</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((t) => {
          const s = d.topicStats[t.id];
          return (
            <div key={t.id} data-testid={`topic-${t.name}`} className="p-5 rounded-2xl bg-background-card border border-background-border flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h4 className="text-base font-bold text-white">{t.name}</h4>
                    <Badge variant={t.is_active ? 'success' : 'neutral'} size="sm">{t.is_active ? 'Active' : 'Disabled'}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setEditing(t)} className="text-slate-500 hover:text-indigo-400 rounded-lg min-h-[40px] min-w-[40px] inline-flex items-center justify-center" title="Edit topic" aria-label={`Edit ${t.name}`}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(t)} className="text-slate-500 hover:text-rose-400 rounded-lg min-h-[40px] min-w-[40px] inline-flex items-center justify-center" title="Delete topic" aria-label={`Delete ${t.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{t.description || 'No description provided.'}</p>
                {s && (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]" data-testid={`topic-stats-${t.name}`}>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{s.games_using} game(s)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{s.pool_questions} pooled question(s)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{s.challenges} challenge(s)</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end pt-2 border-t border-background-border">
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  disabled={d.busy.has(`topic-toggle:${t.id}`)}
                  data-testid={`toggle-${t.name}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold min-h-[40px] disabled:opacity-50 ${t.is_active ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'}`}
                >
                  {t.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <EmptyState title="No topics match your search" />}

      {showAdd && <TopicModal d={d} onClose={() => setShowAdd(false)} />}
      {editing && <TopicModal d={d} topic={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

const TopicModal: React.FC<{ d: AdminData; topic?: Topic; onClose: () => void }> = ({ d, topic, onClose }) => {
  const [name, setName] = useState(topic?.name ?? '');
  const [desc, setDesc] = useState(topic?.description ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Topic name cannot be empty.');
    if (saving) return;
    setSaving(true);
    try {
      if (topic) await gameService.editTopic(topic.id, name, desc);
      else await gameService.addTopic(name, desc);
      await d.refresh({ quiet: true });
      onClose();
      d.flash('success', topic ? 'Topic updated.' : `Topic “${name.trim()}” added.`);
    } catch (e: any) {
      setErr(e.message || 'Could not save topic');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={topic ? 'Edit Topic' : 'Add Custom Topic'} subtitle={topic ? undefined : 'Custom topics need an AI key (or manual questions) to build a pool of 7+ questions.'} testId="topic-modal">
      <ErrorBox message={err} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="tp-name">Category Name *</label>
          <input id="tp-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Anime & Gaming" autoFocus />
        </div>
        <div>
          <label className={labelCls} htmlFor="tp-desc">Description</label>
          <textarea id="tp-desc" className={`${inputCls} min-h-[72px]`} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} rows={2} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryBtn} data-testid="topic-save">{saving ? 'Saving…' : topic ? 'Save Changes' : 'Add Topic'}</button>
        </div>
      </form>
    </Modal>
  );
};
