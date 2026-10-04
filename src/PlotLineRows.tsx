import { AtlasIcon } from './AtlasIcon';
import type { Project } from './model';
import type { TimelineCursor } from './playback';
import { axisView } from './temporal';
import { lineRolesAt, roleLabel } from './lines';
import { openLine } from './NarrativeLines';

/** One global presentation sequence. Membership never creates a separate clock. */
export default function PlotLineRows({ project: p, cursor, onSelect, onPreview }: { project: Project; cursor: TimelineCursor | null; onSelect: (cursor: TimelineCursor, element?: HTMLElement) => void; onPreview: (cursor: TimelineCursor | null) => void }) {
  const list = p.timelines.narrative.placements, lines = p.narrativeLines ?? [], view = axisView(p, 'narrative');
  const acts = view.units.filter(u => u.kind === 'act');
  return <section className="plot-line-board" aria-label="共用呈現順序的情節線"><header><h3><AtlasIcon name="sequence"/>情節線</h3><small>橫向共用呈現進度；同一事件可屬於多條線</small><button aria-label="Manage plot line membership" onClick={() => openLine()}>編輯故事線</button></header>
    {!lines.length ? <p className="content-help">加入一條故事線並勾選事件，就能沿相同的呈現順序對照。</p> : <div className="plot-line-scroll" tabIndex={0} aria-label="橫向捲動情節線"><div className="plot-line-grid" style={{ gridTemplateColumns: `144px repeat(${list.length}, minmax(68px, 1fr))` }}>
      <span className="plot-line-heading">呈現結構</span>{acts.map(act => { const first = list.findIndex(o => o.id === act.occurrenceIds[0]); return <span key={act.id} className="plot-act-frame" style={{ gridColumn: `${first + 2} / span ${act.occurrenceIds.length}` }}><AtlasIcon name="act"/>{act.title}</span>; })}
      <span className="plot-line-heading">呈現步序</span>{list.map((item, i) => <button key={item.id} className="plot-progress-cell" data-current={cursor?.basis === 'narrative' && cursor.occurrenceId === item.id} title={p.units.find(u => u.id === item.eventId)?.title} onFocus={() => onPreview({ basis: 'narrative', occurrenceId: item.id })} onBlur={() => onPreview(null)} onClick={e => onSelect({ basis: 'narrative', occurrenceId: item.id }, e.currentTarget)}>{i + 1}</button>)}
      {lines.map(line => { const roles = lineRolesAt(p, line, 'narrative'); return [<button className="plot-line-heading" key={line.id} onClick={() => openLine(line.id)}><b>{line.title}</b><small>{line.eventIds.length} 個共用事件</small></button>, ...list.map((item, i) => { const member = line.eventIds.includes(item.eventId), role = roles.get(i); return <div key={line.id + item.id} className="plot-membership-cell" data-member={member} data-current={cursor?.basis === 'narrative' && cursor.occurrenceId === item.id}>{member && <button data-plot-line={line.id} data-plot-occurrence={item.id} aria-label={`${line.title}，呈現第 ${i + 1} 步：${p.units.find(u => u.id === item.eventId)?.title}`} title={`${role ? roleLabel(role) : '角色未指定'}；這個節點是共用事件的此次呈現`} onPointerEnter={e => { if (e.pointerType !== 'touch') onPreview({ basis: 'narrative', occurrenceId: item.id }); }} onPointerLeave={() => onPreview(null)} onFocus={() => onPreview({ basis: 'narrative', occurrenceId: item.id })} onBlur={() => onPreview(null)} onClick={e => onSelect({ basis: 'narrative', occurrenceId: item.id }, e.currentTarget)}><span>{p.units.find(u => u.id === item.eventId)?.title}</span>{item.mode === 'repeat' && <small>再次呈現</small>}</button>}</div>; })]; })}
    </div></div>}
  </section>;
}
