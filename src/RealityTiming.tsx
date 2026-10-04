import { useEffect, useState, type FormEvent } from 'react';
import { editor, useEditor } from './store';
import { uid, type Project } from './model';
import { compareWorldEvents, enableWorldRelations, removeWorldRelation, sameTimeGroups, setWorldRelation, simultaneousStateWarnings, worldOrderLabels, type WorldRelation } from './worldTiming';
import { AtlasIcon } from './AtlasIcon';

export function openWorldTiming(eventId?: string) {
  const p = editor.getState().project, item = p.timelines.reality.placements.find(o => o.eventId === eventId) ?? p.timelines.reality.placements[0];
  editor.setState({ basis: 'reality', occurrenceId: item.id, selectedId: item.eventId, playhead: p.timelines.reality.placements.indexOf(item) + .5, panel: 'compare', inspectorOpen: true, outlineOpen: false });
}
export function RealityTimingSummary({ p, eventId }: { p: Project; eventId?: string }) {
  const groups = sameTimeGroups(p);
  return <div className="world-timing-summary"><button aria-label="Edit world time relations" onClick={() => openWorldTiming(eventId)}><AtlasIcon name="clock"/>{p.realityTiming ? '編輯先後／同時' : '設定明確先後／同時'}</button>{p.realityTiming && <><small>横向為閱讀位置；世界先後只依明確關係，未連結不代表同時</small>{groups.filter(g => !eventId || g.includes(eventId)).map(g => <span className="world-simultaneous" key={g[0]}>同時［{g.map(id => p.units.find(u => u.id === id)?.title).join(' ＋ ')}］</span>)}</>}</div>;
}
export default function RealityTimingEditor({ eventId }: { eventId: string }) {
  const p = useEditor(s => s.project), events = p.units.filter(u => u.kind === 'beat');
  const [toId, setToId] = useState(events.find(u => u.id !== eventId)?.id ?? ''), [kind, setKind] = useState<'before' | 'after' | 'same-time'>('before'), [note, setNote] = useState(''), [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { setToId(events.find(u => u.id !== eventId)?.id ?? ''); setEditingId(null); setNote(''); }, [eventId]);
  const list = p.realityTiming?.relations ?? [], touching = list.filter(r => r.fromEventId === eventId || r.toEventId === eventId);
  function submit(e: FormEvent) { e.preventDefault(); const r: WorldRelation = { id: editingId ?? uid(), kind: kind === 'same-time' ? kind : 'before', fromEventId: kind === 'after' ? toId : eventId, toEventId: kind === 'after' ? eventId : toId, note }; editor.getState().transact(next => setWorldRelation(next, r)); if (!editor.getState().notice) { setEditingId(null); setNote(''); } }
  function edit(r: WorldRelation) { const forward = r.fromEventId === eventId; setToId(forward ? r.toEventId : r.fromEventId); setKind(r.kind === 'same-time' ? 'same-time' : forward ? 'before' : 'after'); setNote(r.note); setEditingId(r.id); }
  return <section className="world-timing-editor" aria-label="世界先後與同時關係"><h3><AtlasIcon name="clock"/>世界先後／同時</h3>
    {!p.realityTiming ? <><p>目前沿用原本的世界事件順序。啟用後會保留每一組相鄰先後，再由你明確調整；不會自動把相鄰事件當成同時。</p><button aria-label="Enable world relationships" onClick={() => editor.getState().transact(enableWorldRelations)}>保留原順序，開始設定</button></> : <>
      <p className="content-help">這裡定義世界中的先後；移動閱讀列表不會修改這些關係。這不是因果或時長。</p>
      <form onSubmit={submit} aria-label="World relation form"><strong>{p.units.find(u => u.id === eventId)?.title}</strong><div className="content-form-pair"><label>關係<select aria-label="World relation kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="before">早於</option><option value="after">晚於</option><option value="same-time">同時發生</option></select></label><label>另一事件<select aria-label="World relation target" value={toId} onChange={e => setToId(e.target.value)}>{events.filter(u => u.id !== eventId).map(u => <option key={u.id} value={u.id}>{u.title}{p.timelines.reality.placements.some(o => o.eventId === u.id) ? '' : '（未排入世界列表）'}</option>)}</select></label></div><small>目前已知：{worldOrderLabels[compareWorldEvents(p, eventId, toId)]}（包含關係的明確推論）</small><label>註記<input aria-label="World relation note" value={note} maxLength={20000} onChange={e => setNote(e.target.value)}/></label><div className="content-form-actions"><button type="submit" disabled={!toId}>{editingId ? '儲存時序關係' : '加入時序關係'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setNote(''); }}>取消編輯</button>}</div></form>
      <div className="world-relation-list">{touching.length ? touching.map(r => <div key={r.id}><button onClick={() => edit(r)} title="編輯這個明確關係">{p.units.find(u => u.id === r.fromEventId)?.title}<b>{r.kind === 'before' ? ' → ' : ' ＝ '}</b>{p.units.find(u => u.id === r.toEventId)?.title}{r.note && <small>{r.note}</small>}</button><button aria-label={`Remove world relation ${r.id}`} title="移除這個關係；可復原" onClick={() => { editor.getState().transact(next => removeWorldRelation(next, r.id)); if (editingId === r.id) setEditingId(null); }}>×</button></div>) : <small>此事件尚無直接關係；未定不等於同時。</small>}</div>
      {simultaneousStateWarnings(p).map(w => <p className="content-warning" role="alert" key={w}>{w}</p>)}
      <details><summary>查看所有 {list.length} 個明確關係</summary><div className="world-all-relations">{list.map(r => <button key={r.id} onClick={() => openWorldTiming(r.fromEventId)}>{p.units.find(u => u.id === r.fromEventId)?.title} {r.kind === 'before' ? '→' : '＝'} {p.units.find(u => u.id === r.toEventId)?.title}</button>)}</div></details>
      <small>衝突或循環不會儲存；請先移除矛盾關係，再加入新的設定。</small>
    </>}
  </section>;
}
