import { AtlasIcon, KindIcon } from "./AtlasIcon";
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { editor, useEditor } from './store';
import { descendants, type Project } from './model';
import { axisView, viewSegmentLabel, bases, basisLabels, moveOccurrences, stateAtBasis, type Occurrence, type TimeBasis } from './temporal';
import { resolveHoloSelection } from './hologram';
import { emotionTypes, type AudienceDesign } from './audience';
import { engineInput, replaySimulation } from './audienceSimulation';
import { isRunStale } from './audienceEngine';
import { lineRolesAt, lineStroke, roleLabel } from './lines';
import { openLine } from './NarrativeLines';

const subtitles = { reality: '世界發生順序', narrative: '敘事呈現順序', audience: '觀眾理解順序' };
const colors = { reality: '#83d6b0', narrative: '#80bdff', audience: '#d7b3ff' };
const emotionLabels = { curiosity: '好奇', tension: '緊張', trust: '信任', sadness: '悲傷', relief: '釋然' };
const cognitionLabels = { knows: '知道', believes: '相信', questions: '疑問' };
const responseLabels = { open: '未回應', realized: '實現', delayed: '延後', subverted: '反轉' };

export function chooseOccurrence(project: Project, basis: TimeBasis, item: Occurrence) {
  const index = project.timelines[basis].placements.findIndex(o => o.id === item.id);
  if (index < 0) return;
  editor.setState({ basis, selectedId: item.eventId, occurrenceId: item.id, playhead: index + .5 });
}

function AudienceDelta({ project, item, onAudience }: { project: Project; item?: Occurrence; onAudience: () => void }) {
  const list = project.timelines.audience.placements;
  const index = item ? list.findIndex(o => o.id === item.id) : -1;
  const current = item?.audienceDesign;
  // Compare adjacent authored checkpoints. Missing fields are unknown, never zero or carried values.
  const previous = index > 0 ? list[index - 1].audienceDesign : undefined;
  const saved = project.audienceEngine?.lastRun;
  const run = useMemo(() => replaySimulation(saved), [saved]);
  const stale = useMemo(() => !!run && isRunStale(run, engineInput(project)), [run, project]);
  const checkpoint = run?.checkpoints.find(c => c.occurrenceId === item?.id);
  const resolved = list.slice(0, Math.max(0, index)).flatMap(o => (o.audienceDesign?.expectations ?? []).filter(e => e.responseId === item?.id));
  const expectations = [...(current?.expectations ?? []), ...resolved];
  const format = (value: string | undefined) => value?.trim() || '未設定';
  const change = (key: keyof AudienceDesign['cognition']) => `${format(previous?.cognition[key])} → ${format(current?.cognition[key])}`;
  return <div className="aligned-audience" aria-label="Authored audience changes">
    <div className="aligned-delta-heading"><span>觀眾變化 · 作者設定{current?.example ? '範例' : ''}{item ? ` · Audience #${index + 1}` : ''}</span><button disabled={!item} onClick={onAudience}>編輯觀眾設計</button></div>
    {!item ? <p className="aligned-empty">此事件尚未對應到 Audience；可在「時間對應」加入</p> : !current && !resolved.length ? <p className="aligned-empty">此處尚未設定情緒、認知或預期。空白不代表沒有變化</p> : <>
      <div className="aligned-deltas">
        <section><h3>認知</h3>{(['knows', 'believes', 'questions'] as const).map(key => <div className="aligned-cognition" key={key}><span>{cognitionLabels[key]}</span><p title={change(key)}>{change(key)}</p></div>)}</section>
        <section><h3>情緒</h3><div className="aligned-emotions">{emotionTypes.filter(key => current?.emotions[key] !== undefined || previous?.emotions[key] !== undefined).map(key => {
          const before = previous?.emotions[key], after = current?.emotions[key];
          return <div key={key}><span>{emotionLabels[key]}</span><b>{before ?? '—'} → {after ?? '—'}</b><small>{before !== undefined && after !== undefined ? `${after - before > 0 ? '+' : ''}${after - before}` : '未能比較'}</small></div>;
        })}</div>{!Object.keys(current?.emotions ?? {}).length && <p>尚未設定</p>}</section>
        <section><h3>預期</h3>{expectations.length ? expectations.slice(0, 2).map((e, i) => <p className="aligned-expectation" key={e.id + i} title={e.text}><b>{resolved.includes(e) ? '此處' : e.responseId ? `預計 #${list.findIndex(o => o.id === e.responseId) + 1}` : '新預期'} · {responseLabels[e.response]}</b><span>{e.text || '未命名預期'}</span></p>) : <p>此處未設定新預期或回應</p>}{expectations.length > 2 && <small>另有 {expectations.length - 2} 項，於觀眾設計查看</small>}</section>
      </div>
      <p className="aligned-comparison-note">前一個 Audience 節點 → 此節點；「—／未設定」不等於 0</p>
    </>}
    <div className="aligned-evidence-status"><span data-simulation-status={!item ? 'unmapped' : !saved ? 'not-run' : !run ? 'unsupported' : stale ? 'stale' : !checkpoint?.complete ? 'incomplete' : 'current'}>規則推導 · {!item ? '此事件未對應' : !saved ? '尚未運算' : !run ? '版本不符，需重算' : stale ? '結果已過期，需重算' : !checkpoint?.complete ? '有未解輸入' : '已運算'}{run && !stale && checkpoint?.complete ? ` · ${run.trace.filter(t => t.occurrenceId === item?.id).reduce((n, t) => n + t.deltas.length, 0)} 項狀態更新` : ''}</span><span>實際試映回饋 · {item?.audienceObservations?.length ?? 0} 則（獨立記錄）</span></div>
  </div>;
}

export default function AlignedTimelines({ mobile, onAudience }: { mobile: boolean; onAudience: () => void }) {
  const { project, basis, selectedId, occurrenceId, trackId, lineId } = useEditor(s => s);
  const selected = project.units.find(u => u.id === selectedId);
  const selectedIds = useMemo(() => new Set(selected?.kind === 'beat' ? [selectedId] : selected ? descendants(project, selectedId).filter(u => u.kind === 'beat').map(u => u.id) : []), [project, selectedId, selected]);
  const active = resolveHoloSelection(project, basis, selectedId, occurrenceId);
  const list = project.timelines[basis].placements;
  const index = active ? list.findIndex(o => o.id === active.id) : -1;
  const priorOrder = useRef({ project, basis, occurrenceId: active?.id, index });
  useEffect(() => {
    const before = priorOrder.current;
    if (before.project !== project && before.basis === basis && active?.id === before.occurrenceId && before.index !== index && index >= 0) {
      // Undo/redo can move a still-selected occurrence. Keep its inspector cursor attached.
      editor.setState({ playhead: index + .5 });
    }
    priorOrder.current = { project, basis, occurrenceId: active?.id, index };
  }, [project, basis, active?.id, index]);
  const viewport = useRef<HTMLDivElement>(null);
  const cell = mobile ? 120 : 152, head = mobile ? 105 : 142, row = mobile ? 134 : 146;
  const count = Math.max(1, ...bases.map(b => project.timelines[b].placements.length));
  const width = head + count * cell + 24;
  const nodes = useMemo(() => bases.map(b => ({ basis: b, projection: axisView(project, b), items: project.timelines[b].placements })), [project]);
  const line = project.narrativeLines?.find(l => l.id === lineId) ?? project.narrativeLines?.[0];
  const roles = useMemo(() => Object.fromEntries(bases.map(b => [b, line ? lineRolesAt(project, line, b) : new Map()])) as Record<TimeBasis, ReturnType<typeof lineRolesAt>>, [project, line]);
  // Scrolling never changes selection. Explicit selection brings that exact occurrence into view.
  useEffect(() => {
    const el = viewport.current;
    if (!el || index < 0) return;
    const left = index * cell, right = left + cell;
    const visibleWidth = Math.max(cell, el.clientWidth - head);
    if (left < el.scrollLeft || right > el.scrollLeft + visibleWidth) el.scrollLeft = Math.max(0, left - visibleWidth / 2 + cell / 2);
  }, [basis, active?.id, index, cell, head]);
  const mappings = nodes.map(n => ({ basis: n.basis, items: n.items.flatMap((item, index) => selectedIds.has(item.eventId) ? [{ item, index }] : []) }));
  const audienceItem = basis === 'audience' && active ? active : mappings[2].items[0]?.item;
  const track = project.tracks.find(t => t.id === trackId);
  const snapshot = track && index >= 0 ? stateAtBasis(project, track.id, index + .5, basis) : null;
  function pick(b: TimeBasis, item: Occurrence) { chooseOccurrence(project, b, item); }
  function move(direction: -1 | 1) {
    if (!active || !list[index + direction]) return;
    const id = active.id;
    editor.getState().transact(p => moveOccurrences(p, basis, [id], list[index + direction].id));
    const next = editor.getState().project;
    const item = next.timelines[basis].placements.find(o => o.id === id);
    if (item) chooseOccurrence(next, basis, item);
  }
  const links = selected?.kind === 'beat' ? mappings.slice(0, -1).flatMap((from, i) => {
    const target = mappings.slice(i + 1).find(m => m.items.length);
    if (!target) return [];
    const toRow = bases.indexOf(target.basis);
    return from.items.flatMap(a => target.items.map(b => ({ key: `${a.item.id}:${b.item.id}`, x1: head + (a.index + .5) * cell, y1: i * row + 73, x2: head + (b.index + .5) * cell, y2: toRow * row + 73 })));
  }) : [];
  return <section className="aligned-atlas" aria-label="Aligned narrative timelines">
    <div className="aligned-instructions"><span>點一個事件，查看三條線上的所有對應</span><small>各線的 # 是自己的順序，不是共同時間；虛線只表示同一事件</small></div>
    <div className="aligned-scroll" ref={viewport} tabIndex={0} aria-label="Pan all three timelines horizontally">
      <div className="aligned-board" style={{ width, '--aligned-cell': `${cell}px`, '--aligned-head': `${head}px`, '--aligned-row': `${row}px` } as CSSProperties}>
        <svg className="aligned-links" width={width} height={row * 3} aria-hidden="true">{links.map(l => <path key={l.key} d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2},${l.x2} ${(l.y1 + l.y2) / 2},${l.x2} ${l.y2}`} data-edge-kind="event-correspondence" />)}</svg>
        {nodes.map(({ basis: b, projection, items }, lane) => <div className={`aligned-lane ${b === basis ? 'is-active' : ''}`} key={b} data-basis={b} style={{ '--lane-color': colors[b] } as CSSProperties}>
          <div className="aligned-lane-heading"><AtlasIcon name={b}/><b>{basisLabels[b]}</b><span>{subtitles[b]}</span><small>{items.length} 個節點</small>{selected?.kind === 'beat' && !mappings[lane].items.length && <em>未對應</em>}</div>
          <div className="aligned-lane-plot">
            <div className="aligned-order-line" style={{ width: Math.max(0, (items.length - 1) * cell), left: cell / 2 }} />
            {projection.units.filter(u => b === 'narrative' && (u.kind === 'act' || u.kind === 'scene')).map(u => {
              const range = projection.ranges.get(u.id)!;
              return <div className={`aligned-container ${u.kind}`} data-container-kind={u.kind} key={u.id} style={{ left: range.start * cell + 4, width: (range.end - range.start) * cell - 8 }} title={`${u.kind} · ${u.title}${viewSegmentLabel(projection.units,u) ? ` · ${viewSegmentLabel(projection.units,u)}；同一故事單元在此順序中的分段` : ''}`} data-container-id={u.canonicalId}><span><KindIcon kind={u.kind}/>{u.title}{viewSegmentLabel(projection.units,u) && <small className="container-segment-label">{viewSegmentLabel(projection.units,u)}</small>}</span></div>;
            })}
            {items.map((item, i) => {
              const event = project.units.find(u => u.id === item.eventId)!;
              const mapped = selectedIds.has(item.eventId), exact = b === basis && active?.id === item.id;
              const role = roles[b].get(i), stroke = role && lineStroke(role);
              const repeated = items.filter(o => o.eventId === item.eventId).length > 1;
              return <button className={`aligned-node ${mapped ? 'is-mapped' : ''} ${exact ? 'is-selected' : ''}`} key={item.id} style={{ left: i * cell, width: cell }} data-event-id={event.id} data-occurrence-id={item.id} data-corresponding={mapped} aria-pressed={exact} aria-label={`${basisLabels[b]} #${i + 1}: ${event.title} · ${item.mode}${repeated ? ' · repeated event' : ''}`} title={`${event.title}\n${basisLabels[b]} #${i + 1} · ${item.mode}`} onClick={() => pick(b, item)}>
                <span className="aligned-node-symbol"><i className={event.turningPoint ? 'turning' : ''}/><small>#{i + 1}{repeated ? ' ↻' : ''}</small></span>
                <span className="aligned-node-title">{event.title || '未命名事件'}</span>
                {role && line && <svg className="aligned-line-role" data-line-id={line.id} data-line-occurrence={item.id} data-role={roleLabel(role)} viewBox="0 0 100 8" aria-label={`${line.title} · ${roleLabel(role)}`}><path d="M4 4H96" stroke={line.color} strokeWidth={stroke!.width} strokeDasharray={stroke!.dash}/></svg>}
              </button>;
            })}
            {!items.length && <p className="aligned-empty-lane">此線尚無節點</p>}
          </div>
        </div>)}
      </div>
    </div>
    <details className="aligned-structure-context"><summary>作品結構歸屬</summary><p>幕、段落與場是作品編排的結構。上方只在呈現順序顯示結構帶；世界順序與理解順序保留各自的事件步序。</p><p>{active ? `目前事件所屬：${project.units.find(u => u.id === active.containerId)?.title ?? '未指定'}` : '先選擇一個事件'}</p></details>
    <div className="aligned-navigation"><button aria-label="Previous occurrence" disabled={index <= 0} onClick={() => pick(basis, list[index - 1])}>上一個</button><label><span>{basisLabels[basis]}</span><select aria-label="Jump to occurrence" value={active?.id ?? ''} onChange={e => { const item = list.find(o => o.id === e.target.value); if (item) pick(basis, item); }}><option value="" disabled>選擇節點</option>{list.map((o, i) => <option value={o.id} key={o.id}>#{i + 1} · {project.units.find(u => u.id === o.eventId)?.title} · {o.mode}</option>)}</select></label><button aria-label="Next occurrence" disabled={index < 0 || index >= list.length - 1} onClick={() => pick(basis, list[index + 1])}>下一個</button></div>
    <div className="aligned-selection" aria-label="Selected event summary"><div className="aligned-selection-title"><div><small>{active ? `${basisLabels[basis]} #${index + 1} · ${active.mode}` : '選取單元'}</small><h2>{selected?.title || '選擇一個事件'}</h2></div><button title="開啟右側內容編輯；修改此事件所有位置共用的內容" className="panel-trigger" aria-label="Edit selected event" onClick={() => editor.setState({ panel: 'edit', inspectorOpen: true, outlineOpen: false })}><AtlasIcon name="edit"/>編輯內容</button></div>
      <div className="aligned-mappings" aria-label="Shared event correspondence">{mappings.map(m => <div key={m.basis}><b>{basisLabels[m.basis]}</b>{m.items.length ? m.items.map(({ item, index }) => <button aria-label={`Go to ${basisLabels[m.basis]} occurrence ${index + 1}`} className={basis === m.basis && active?.id === item.id ? 'active' : ''} key={item.id} onClick={() => pick(m.basis, item)}>#{index + 1}<span>{item.mode === 'repeat' ? ' ↻' : ''}</span></button>) : <span className="aligned-missing">未對應</span>}</div>)}</div>
      {track && snapshot && <div className="aligned-perspective"><b>{track.name}</b><span>{snapshot.snapshot.state || '尚未設定狀態'}</span><p>{snapshot.snapshot.knowledge || '尚未設定已知資訊'}</p><small>{snapshot.source}</small></div>}
      <AudienceDelta project={project} item={audienceItem} onAudience={() => { if (audienceItem) pick('audience', audienceItem); onAudience(); }}/>
      <div className="aligned-actions"><span>僅重排 {basisLabels[basis]}</span><button aria-label="Move selected occurrence earlier" disabled={index <= 0} onClick={() => move(-1)}>提前</button><button aria-label="Move selected occurrence later" disabled={index < 0 || index >= list.length - 1} onClick={() => move(1)}>延後</button><button onClick={() => editor.setState({ panel: 'compare', inspectorOpen: true, outlineOpen: false })}>時間對應</button>{line && <button onClick={() => openLine(line.id)} style={{ color: line.color }}>⌁ {line.title}</button>}</div>
    </div>
  </section>;
}
