import { useLayoutEffect, useMemo, useState } from 'react';
import { AtlasIcon } from './AtlasIcon';
import { editor, useEditor } from './store';
import { type Project, type Unit, uid } from './model';
import { type Occurrence, moveOccurrences, stateAtBasis } from './temporal';
import { addLine, updateLine } from './lines';
import { emotionTypes } from './audience';
import { authoredAudienceDesign, editInlineAudience, editImpacts, eventNeighborhood, storyChecks } from './eventWorkflow';

const show = (s?: string) => s?.trim() && s !== 'Unstated' ? s : '未知 · 尚未寫下';
const commit = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); };
function tx(fn: (p: Project) => void) { editor.getState().transact(fn); }
export function PlotBadges({ project, eventId }: { project: Project; eventId: string }) {
  const lines = project.narrativeLines?.filter(l => l.eventIds.includes(eventId)) ?? [];
  return <span className="event-plot-badges">{lines.map(l => <span key={l.id}>{l.title}</span>)}</span>;
}
export function EventLinks({ project, eventId, pick }: { project: Project; eventId: string; pick: (id: string) => void }) {
  const n = eventNeighborhood(project, eventId);
  return <section className="event-links" aria-label="此事件的明確因果連結"><div><small>原因事件</small>{n.cause ? <button onClick={() => pick(n.cause!.id)}><AtlasIcon name="beat"/>{n.cause.title}</button> : <span>未指定</span>}</div><span className="event-link-arrow" aria-hidden="true">→</span><div className="event-links-current"><small>目前事件</small><b>{project.units.find(u => u.id === eventId)?.title}</b><PlotBadges project={project} eventId={eventId}/></div><span className="event-link-arrow" aria-hidden="true">→</span><div><small>直接後果事件</small>{n.consequences.length ? n.consequences.map(u => <button key={u.id} onClick={() => pick(u.id)}><AtlasIcon name="beat"/>{u.title}</button>) : <span>未指定</span>}</div></section>;
}
export function EventSituation({ project, event, audienceId }: { project: Project; event: Unit; audienceId?: string }) {
  const o = project.timelines.reality.placements.find(o => o.eventId === event.id);
  const linked = project.transitions.filter(t => t.eventId === event.id).flatMap(t => { const track = project.tracks.find(c => c.id === t.trackId && c.kind === 'character'); if (!track) return []; const afterState = o ? stateAtBasis(project, track.id, project.timelines.reality.placements.indexOf(o) + .5, 'reality') : undefined; return [{ track, transition: t, unresolved: afterState?.unresolved }]; });
  const audience = project.timelines.audience.placements.filter(o => o.eventId === event.id && (!audienceId || o.id === audienceId));
  return <section className="event-situation" aria-label="同一事件的世界人物觀眾對照">
    <div className="event-situation-heading"><b>同一事件，三種資訊</b><small>身分對應；不是同時發生或同一把時間尺</small></div>
    <div className="event-situation-grid">
      <section><h3><AtlasIcon name="reality"/>世界事實</h3><p>{show(event.summary)}</p><small>作者寫下的事件與結果</small>{event.storyLogic?.outcome && <p>{event.storyLogic.outcome}</p>}</section>
      <section><h3><AtlasIcon name="person"/>人物知道／想要</h3>{linked.length ? linked.map(c => <div key={c.track.id} className="event-person-state"><b>{c.track.name}</b><p><span>知道</span>{show(c.transition.after.knowledge)}</p><p><span>想要</span>{show(c.transition.after.goal)}</p><small>{!o ? '未映射世界順序；只列此事件保存的設定' : c.unresolved ? '世界承接未定或同時設定衝突；只列此事件保存的設定' : '此事件保存的後狀態（含沿用）'}</small></div>) : <p className="event-unknown">未知 · 此事件尚未連結人物</p>}<small>未連結人物不推定在場、知情或受影響</small></section>
      <section><h3><AtlasIcon name="audience"/>觀眾知道／期待</h3>{audience.length ? audience.map(o => { const d = authoredAudienceDesign(project, o); return <div key={o.id}><b>理解節點 {project.timelines.audience.placements.indexOf(o) + 1}</b><p><span>知道</span>{show(d.cognition.knows)}</p><p><span>期待</span>{d.expectations.filter(e => e.text.trim()).map(e => e.text).join('；') || '未知 · 尚未設計'}</p></div>; }) : <p className="event-unknown">未知 · 尚無對應理解節點</p>}<small>作者設計；不推測真實觀眾反應</small></section>
    </div>
  </section>;
}
export function PlotMembershipEditor({ project, eventId }: { project: Project; eventId: string }) {
  const [name, setName] = useState('');
  useLayoutEffect(() => setName(''), [project, eventId]);
  return <details className="event-plot-editor"><summary><AtlasIcon name="sequence"/>故事線歸屬（選填）<PlotBadges project={project} eventId={eventId}/></summary><p>一件事可以同時推進多條故事線。主線／副線等範圍角色仍在故事線工具管理</p><div className="event-check-options">{project.narrativeLines?.map(l => <label key={l.id}><input type="checkbox" checked={l.eventIds.includes(eventId)} onChange={e => { const checked = e.target.checked; tx(p => updateLine(p, l.id, { eventIds: checked ? [...l.eventIds, eventId] : l.eventIds.filter(id => id !== eventId) })); }}/>{l.title}</label>)}</div><form onSubmit={e => { e.preventDefault(); commit(); const title = name.trim(); if (!title) return; tx(p => { const id = addLine(p, [eventId]); updateLine(p, id, { title, color: '#b6b6c0' }); }); }}><label>新增故事線<input aria-label="新增故事線名稱" value={name} onChange={e => setName(e.target.value)} maxLength={300} placeholder="例如：追查失蹤／重建信任"/></label><button disabled={!name.trim() || (project.narrativeLines?.length ?? 0) >= 24}>建立並加入此事件</button></form></details>;
}
export function EventCheckPanel({ project, eventId, pick, readonly = false }: { project: Project; eventId: string; pick: (id: string) => void; readonly?: boolean }) {
  const past = useEditor(s => s.past);
  const allChecks = useMemo(() => storyChecks(project), [project]);
  const checks = allChecks.filter(c => c.eventId === eventId || c.sourceEventId === eventId);
  const pending = checks.filter(c => c.status !== 'verified');
  const impacts = useMemo(() => readonly ? [] : editImpacts(past.at(-1), project), [readonly, past, project]);
  return <section className="event-check-panel" aria-label="可追溯的故事檢查"><header><b><AtlasIcon name="path"/>連結檢查</b><span role="status" aria-live="polite">{pending.length ? `${pending.length} 項待確認` : checks.length ? `${checks.length} 個明確連結可追溯` : '尚未指定檢查依據'}</span></header>{pending.map(c => <article key={c.id} data-check-status={c.status}><b>{c.title}</b><p>{c.detail}</p>{c.eventId !== eventId && <button onClick={() => pick(c.eventId)}>查看依賴事件</button>}</article>)}{checks.some(c => c.status === 'verified') && <details><summary>查看已確認的來源 · {checks.filter(c => c.status === 'verified').length}</summary>{checks.filter(c => c.status === 'verified').map(c => <p key={c.id}><b>{c.title}</b><br/>{c.detail}</p>)}</details>}{!checks.length && <p>未知。先指定原因事件、選擇的動機來源，或理解節點的先決揭露；不會從文字自動推論</p>}{impacts.length > 0 && <details className="event-edit-impacts" open><summary>上一步修改的影響 · {impacts.length}</summary><ul>{impacts.map(i => <li key={i.id}><span>{i.text}</span>{i.eventId !== eventId && project.units.some(u => u.id === i.eventId) && <button onClick={() => pick(i.eventId)}>查看事件</button>}</li>)}</ul><small>只比較上一次已儲存的編輯；不預測情緒或故事品質</small></details>}</section>;
}
export function AudienceInlineDesign({ project, occurrence }: { project: Project; occurrence: Occurrence }) {
  const list = project.timelines.audience.placements, at = list.findIndex(o => o.id === occurrence.id), d = authoredAudienceDesign(project, occurrence);
  const update = (fn: (d: typeof occurrence.audienceDesign & object) => void) => tx(p => editInlineAudience(p, occurrence.id, fn));
  const missing = d.requiredEarlierIds?.filter(id => !list.some(o => o.id === id)) ?? [];
  return <details className="event-audience-detail"><summary>此理解節點的順序、期待與情緒（選填）</summary>
    <div className="event-occurrence-order"><b>觀眾理解 {at + 1} / {list.length}</b><button disabled={at <= 0} aria-label={`理解節點 ${at + 1} 提前`} onClick={() => tx(p => moveOccurrences(p, 'audience', [occurrence.id], list[at - 1].id))}>提前一步</button><button disabled={at === list.length - 1} aria-label={`理解節點 ${at + 1} 延後`} onClick={() => tx(p => moveOccurrences(p, 'audience', [occurrence.id], list[at + 1].id))}>延後一步</button></div><p>只移動這次理解。世界人物知情與呈現順序各自保留</p>
    <details><summary>此理解必須晚於哪些揭露？</summary><p>勾選代表明確的先決要求；一般佐證資料與因果連結不會自動變成先決條件</p><div className="event-check-options">{list.filter(o => o.id !== occurrence.id).map(o => <label key={o.id}><input type="checkbox" checked={d.requiredEarlierIds?.includes(o.id) ?? false} onChange={e => { const checked = e.target.checked; update(next => { next.requiredEarlierIds = checked ? [...(next.requiredEarlierIds ?? []), o.id] : next.requiredEarlierIds?.filter(id => id !== o.id); }); }}/><span>節點 {list.indexOf(o) + 1} · {project.units.find(u => u.id === o.eventId)?.title}</span></label>)}{missing.map(id => <label key={id}><input type="checkbox" checked onChange={() => update(next => { next.requiredEarlierIds = next.requiredEarlierIds?.filter(x => x !== id); })}/><span>來源已刪除 · 取消勾選以解除</span></label>)}</div></details>
    <details><summary>期待（作者設計） · {d.expectations.length}</summary>{d.expectations.map((e, index) => <div className="event-expectation" key={e.id}><label>期待 {index + 1}<input aria-label={`節點 ${at + 1} 期待 ${index + 1}`} value={e.text} maxLength={20000} onChange={x => update(next => { next.expectations.find(n => n.id === e.id)!.text = x.target.value; })}/></label><label>類型<select value={e.kind} onChange={x => update(next => { next.expectations.find(n => n.id === e.id)!.kind = x.target.value as typeof e.kind; })}><option value="prediction">預測</option><option value="hope">希望</option><option value="fear">擔心</option></select></label><label>回應節點<select aria-label={`節點 ${at + 1} 期待 ${index + 1} 回應位置`} value={e.responseId ?? ''} onChange={x => update(next => { const entry = next.expectations.find(n => n.id === e.id)!; entry.responseId = x.target.value || null; entry.response = x.target.value ? (entry.response === 'open' ? 'realized' : entry.response) : 'open'; })}><option value="">尚未回應</option>{list.slice(at + 1).map(o => <option key={o.id} value={o.id}>節點 {list.indexOf(o) + 1} · {project.units.find(u => u.id === o.eventId)?.title}</option>)}</select></label>{e.responseId && <label>回應方式<select aria-label={`節點 ${at + 1} 期待 ${index + 1} 回應方式`} value={e.response} onChange={x => update(next => { next.expectations.find(n => n.id === e.id)!.response = x.target.value as typeof e.response; })}><option value="realized">實現</option><option value="delayed">延後</option><option value="subverted">反轉</option></select></label>}<button onClick={() => update(next => { next.expectations = next.expectations.filter(n => n.id !== e.id); })}>移除此期待</button></div>)}<button disabled={d.expectations.length >= 100} onClick={() => update(next => { next.expectations.push({ id: uid(), kind: 'prediction', text: '', response: 'open', responseId: null }); })}>加入期待</button></details>
    <details><summary>情緒強度（作者設計）</summary><p>0–100 是你指定的設計刻度，不是對真人的預測；留白代表未知，0 是明確設定</p><div className="event-emotions">{emotionTypes.map(emotion => <label key={emotion}>{({ curiosity: '好奇', tension: '緊張', trust: '信任', sadness: '悲傷', relief: '釋然' })[emotion]}<input type="number" min={0} max={100} aria-label={`節點 ${at + 1} ${emotion}`} value={d.emotions[emotion] ?? ''} placeholder="未知" onChange={e => { const raw = e.target.value; if (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 100)) return; update(next => { if (raw === '') delete next.emotions[emotion]; else next.emotions[emotion] = Number(raw); }); }}/></label>)}</div></details>
  </details>;
}
