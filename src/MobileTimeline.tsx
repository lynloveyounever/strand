import { KindIcon } from "./AtlasIcon";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { editor, useEditor } from './store';
import { visibleUnits, scaleAt, zoomFor, type Scale } from './model';
import { axisView, bases, basisLabels, basisDescriptions, moveOccurrences, type TimeBasis, type ViewUnit } from './temporal';

export function MobileTimelineControls({ onBasis, holographic, onView }: { onBasis: (basis: TimeBasis) => void; holographic: boolean; onView: () => void }) {
  const { project, basis, zoom, trackId } = useEditor(s => s);
  return <div className="phone-controls">
    <div className="phone-control-row">
      <label>Time basis<select aria-label="Timeline basis" value={basis} onChange={e => onBasis(e.target.value as TimeBasis)}>{bases.map(b => <option key={b} value={b}>{basisLabels[b]}</option>)}</select></label>
      <label>Detail level<select aria-label="Detail level" value={scaleAt(zoom)} onChange={e => editor.setState({ zoom: zoomFor(e.target.value as Scale) })}>{(['Story', 'Sequences', 'Scenes', 'Beats'] as Scale[]).map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <div className="phone-control-row phone-pov-row"><label>Perspective<select aria-label="View as perspective" value={trackId} onChange={e => editor.setState({ trackId: e.target.value })}><option value="author">Event · author</option>{project.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button className="phone-view-toggle" aria-pressed={holographic} onClick={onView}>{holographic ? 'Focus cards' : '3D overview'}</button></div>
  </div>;
}

export default function MobileTimeline() {
  const { project, basis, zoom, playhead, trackId } = useEditor(s => s);
  const projection = axisView(project, basis);
  const units = visibleUnits(projection.project, zoom) as ViewUnit[];
  const index = Math.max(0, units.findIndex(n => { const r = projection.ranges.get(n.id)!; return playhead >= r.start && playhead < r.end; }));
  const current = units[index];
  const rail = useRef<HTMLDivElement>(null);
  const reading = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>();
  const scrolling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const track = project.tracks.find(t => t.id === trackId);
  const select = (n: ViewUnit) => {
    const r = projection.ranges.get(n.id)!;
    editor.setState({ selectedId: n.canonicalId, occurrenceId: n.occurrenceIds[0], playhead: r.start + .5 });
  };
  useEffect(() => {
    clearTimeout(scrolling.current);
    const el = rail.current;
    const card = el?.children[index] as HTMLElement | undefined;
    if (el && card) el.scrollLeft = card.offsetLeft;
  }, [index, basis, zoom, project]);
  useEffect(() => () => clearTimeout(scrolling.current), []);
  useEffect(() => { if (reading.current) reading.current.scrollTop = 0; }, [current?.id, basis, zoom]);
  useLayoutEffect(() => {
    const el = rail.current;
    const card = el?.children[index] as HTMLElement | undefined;
    if (!el || !card) return;
    const measure = () => { if (card.offsetHeight) setCardHeight(card.offsetHeight); el.scrollLeft = card.offsetLeft; };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(card);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [index, basis, zoom, trackId, project]);
  const open = (panel: 'cursor' | 'edit' | 'compare') => {
    select(current);
    editor.setState({ panel, inspectorOpen: true, outlineOpen: false });
  };
  const move = (direction: -1 | 1) => {
    const target = units[index + direction];
    if (!target) return;
    // Move the entire visible container past its neighbor, without changing shared event facts.
    const targetIds = target.occurrenceIds;
    editor.getState().transact(p => moveOccurrences(p, basis, current.occurrenceIds, direction < 0 ? targetIds[0] : targetIds.at(-1)!));
    const list = editor.getState().project.timelines[basis].placements;
    const at = list.findIndex(n => n.id === current.occurrenceIds[0]);
    editor.setState({ selectedId: current.canonicalId, occurrenceId: current.occurrenceIds[0], playhead: at + .5 });
  };
  if (!current) return null;
  return <section className="phone-timeline" aria-label="Focused timeline">
    <div className="phone-location">
      
      <div className="phone-minimap" aria-hidden="true">{units.map((n, i) => <i key={n.id} className={i === index ? 'current' : ''} style={{ flexGrow: projection.ranges.get(n.id)!.end - projection.ranges.get(n.id)!.start }} />)}</div>
      <label className="phone-jump"><span aria-live="polite">{index + 1} / {units.length}</span><select aria-label="Jump to timeline card" value={current.id} onChange={e => { const n = units.find(n => n.id === e.target.value); if(n) select(n); }}>{units.map((n, i) => <option key={n.id} value={n.id}>{i + 1}. {n.title}</option>)}</select></label>
    </div>
    <div className="phone-reading" ref={reading}>
      <div className="phone-card-rail" style={cardHeight ? { height: cardHeight } : undefined} ref={rail} aria-label="Swipe timeline cards" onScroll={() => {
        clearTimeout(scrolling.current);
        scrolling.current = setTimeout(() => {
          const el = rail.current;
          if (!el || !el.clientWidth) return;
          const nearest = Math.max(0, Math.min(units.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
          if (nearest !== index) select(units[nearest]);
        }, 100);
      }}>
        {units.map((n, i) => {
          const arc = track ? projection.trackRange(track.id, projection.ranges.get(n.id)!) : null;
          const occurrence = project.timelines[basis].placements.find(x => x.id === n.occurrenceIds[0]);
          return <article className="phone-card-slot" key={n.id} aria-hidden={i !== index} inert={i !== index ? true : undefined}>
            <div className="phone-event-card">
              <div className="phone-card-kicker"><span className="entity-meta"><KindIcon kind={n.kind}/>{n.kind === 'beat' ? occurrence?.mode : n.kind}</span><span>{n.turningPoint ? '◆ Turning point' : `${n.occurrenceIds.length} event${n.occurrenceIds.length === 1 ? '' : 's'}`}</span></div>
              <h2>{n.title}</h2>
              {track && arc ? <div className="phone-perspective" style={{ borderColor: track.color }}><h3>{track.name}</h3><div className="phone-state"><span>Before</span><b>{arc.before.state || 'Unstated'}</b><span>After</span><b>{arc.after.state || 'Unstated'}</b></div><p>{arc.changes.at(-1)?.reaction || arc.after.goal || 'State carries forward'}</p><div className="phone-knowledge"><span>What they know</span><p>{arc.after.knowledge || 'Not authored yet'}</p></div></div> : <p className="phone-summary">{n.summary || 'No summary yet. Open Edit to write this event.'}</p>}
              <div className="phone-card-actions"><button onClick={() => open('cursor')}>{track ? 'State details' : 'Event details'}</button><button className="primary" onClick={() => open('edit')}>Edit</button></div>
            </div>
          </article>;
        })}
      </div>
      <div className="phone-stepper"><button disabled={index === 0} onClick={() => select(units[index - 1])}>Previous</button><span>Swipe to read</span><button disabled={index === units.length - 1} onClick={() => select(units[index + 1])}>Next</button></div>
      <div className="phone-arrange"><span>Reorder in {basisLabels[basis]}</span><div><button disabled={index === 0} onClick={() => move(-1)}>Move earlier</button><button disabled={index === units.length - 1} onClick={() => move(1)}>Move later</button></div></div>
      <button className="phone-compare" onClick={() => open('compare')}>Compare timelines & timing</button>
      <p className="phone-basis-note">{basisDescriptions[basis]}. Reordering changes only this timeline.</p>
    </div>
  </section>;
}
