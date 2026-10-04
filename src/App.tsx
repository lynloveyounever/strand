import { usePhoneLayout, phoneLayoutNow } from './phoneLayout';
import StoryAuthoring from './StoryAuthoring';
import ServerWorkspace from './ServerWorkspace';
import { editStoryContext } from './storyAuthoring';
import StoryTracksPanel from './StoryTracks';
import RealityTimingEditor from './RealityTiming';
import { AtlasIcon, KindIcon, kindNames, basisNames, type AtlasIconName } from "./AtlasIcon";
import StoryReader from "./StoryReader";
import AlignedTimelines from "./AlignedTimelines";
import NarrativeLinesPanel, { LineStrip, openLine } from './NarrativeLines';
import AudienceExperience from './AudienceExperience';
import {
  addOccurrence,
  axisView,
  viewSegmentLabel,
  bases,
  basisDescriptions,
  basisLabels,
  diagnostics,
  eventMappings,
  moveOccurrences,
  patchOccurrence,
  removeOccurrence,
  setOccurrenceState,
  stateAtBasis,
  timelineLength,
  type Occurrence,
  type TimeBasis,
  type ViewUnit,
} from "./temporal";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { editor, useEditor, saveNow } from "./store";
import {
  addUnit,
  approveStage,
  children,
  createBlankProject,
  clone,
  descendants,
  editStage,
  editUnit,
  emptySnapshot,
  fields,
  kinds,
  moveSibling,
  moveToContainer,
  orderedBeats,
  parseProject,
  ranges,
  rebaseStage,
  removeUnit,
  reorderUnit,
  reviewStage,
  scaleAt,
  setTransition,
  stages,
  stateAt,
  trackRange,
  timelineProjection,
  uid,
  updateBlueprint,
  visibleUnits,
  zoomFor,
  type Kind,
  type Project,
  type Scale,
  type Snapshot,
  type StageName,
  type Track,
  type Unit,
} from "./model";
import { createSample, createTimelineDemo } from "./sample";
import { registerWebMCP } from "./webmcp";
import Hologram from "./TimelineNavigator";
import MobileTimeline, { MobileTimelineControls } from "./MobileTimeline";
const stageNames = {
  blueprint: "Writer · blueprint",
  actor: "Actor · realization",
  director: "Director · realization",
};
const labels: Record<string, string> = {
  state: "State",
  knowledge: "What they know",
  goal: "Goal",
  obstacle: "Obstacle",
  motivation: "Driving need",
};
function commitFocusedField() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
function Field({
  label,
  value,
  onSave,
  multiline = false,
  placeholder = "Not authored yet",
}: {
  label: string;
  value: string;
  onSave: (s: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const project = useEditor(s => s.project);
  const [draft, setDraft] = useState(value);
  const source = useRef(project);
  useLayoutEffect(() => { source.current = project; setDraft(value); }, [project, value]);
  const shared = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: () => {
      if (source.current === editor.getState().project && draft !== value) onSave(draft);
    },
    maxLength: 20000,
    placeholder,
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}
    </label>
  );
}
function Badge({
  children: t,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={"badge " + className}>{t}</span>;
}
function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="snapshot">
      <div className="state-label">{snapshot.state || "Unstated"}</div>
      {fields.slice(1).map((key) => (
        <div className="fact" key={key}>
          <span>{labels[key]}</span>
          <p>{snapshot[key] || "Not authored yet"}</p>
        </div>
      ))}
    </div>
  );
}
function SnapshotFields({
  value,
  onSave,
}: {
  value: Snapshot;
  onSave: (s: Snapshot) => void;
}) {
  return (
    <>
      {fields.map((key) => (
        <Field
          key={key}
          label={labels[key]}
          value={value[key]}
          onSave={(s) => onSave({ ...value, [key]: s })}
          multiline={key !== "state"}
        />
      ))}
    </>
  );
}
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function closePanels() {
  // Commit a focused field before dismissing its editor, including Escape.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  editor.setState({ inspectorOpen: false, outlineOpen: false });
}
function deleteSelectedUnit(n: Unit) {
  const count = descendants(editor.getState().project, n.id).length;
  if (confirm(`刪除「${n.title}」${count ? `及其 ${count} 個子單元` : ''}，以及相關位置與追蹤更新？可用復原恢復。`)) editor.getState().transact(p => removeUnit(p, n.id));
}
function Outline({ mobile = false }: { mobile?: boolean }) {
  const p = useEditor((s) => s.project),
    selected = useEditor((s) => s.selectedId);
  const [closed, setClosed] = useState<Set<string>>(
    () => new Set(p.units.filter((n) => n.kind === "scene").map((n) => n.id)),
  );
  const scroll = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor.current || !scroll.current) return;
    const { element, top } = anchor.current;
    if (element.isConnected) scroll.current.scrollTop += element.getBoundingClientRect().top - top;
    anchor.current = null;
  }, [closed]);
  const rr = ranges(p);
  const visit = (id: string, depth = 0): React.ReactNode => {
    const n = p.units.find((n) => n.id === id)!;
    const kids = children(p, id),
      range = rr.get(id)!;
    return (
      <div key={id} className="tree-branch" data-kind={n.kind} data-depth={depth}>
        <div
          data-tree-unit={id}
          className={"tree-item " + (selected === id ? "selected" : "")}
          style={{ paddingLeft: 10 + depth * 16 }}
          draggable={!mobile && n.kind !== "story"}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData("text/plain");
            editor.getState().transact((p) => reorderUnit(p, from, id));
          }}
        >
          {kids.length > 0 ? (
            <button
              className="twisty"
              aria-label={(closed.has(id) ? "Expand " : "Collapse ") + n.title}
              aria-expanded={!closed.has(id)}
              title={(closed.has(id) ? "展開 " : "收起 ") + n.title}
              onClick={(e) => {
                anchor.current = { element: e.currentTarget, top: e.currentTarget.getBoundingClientRect().top };
                const next = new Set(closed);
                next.has(id) ? next.delete(id) : next.add(id);
                setClosed(next);
              }}
            >
              <AtlasIcon name="chevron"/>
            </button>
          ) : (
            <span className="leaf-dot">·</span>
          )}
          <button
            className="tree-title"
            title={n.title}
            onClick={() =>
              editor.setState({
                selectedId: id,
                playhead: range.start + 0.5,
                panel: "edit",
                inspectorOpen: true,
              })
            }
          >
            <KindIcon kind={n.kind}/>
            <span>{n.title}</span>
          </button>
        </div>
        {selected === id && <div className="outline-context-actions" data-outline-actions={id}>
          {n.kind !== 'beat' && <button aria-label="Add child to selected structure" title={`在「${n.title}」內新增${kindNames[kinds[kinds.indexOf(n.kind) + 1]]}`} onClick={() => { let added: string | null = null; editor.getState().transact(next => { added = addUnit(next, n.id); }); if (added && !editor.getState().notice) { setClosed(previous => { const next = new Set(previous); next.delete(n.id); return next; }); editor.setState({ selectedId: added, panel: 'edit', inspectorOpen: true }); } }}>＋ {kindNames[kinds[kinds.indexOf(n.kind) + 1]]}</button>}
          {n.parentId && <button aria-label="Add sibling to selected structure" onClick={() => { const nextSibling = children(p, n.parentId)[children(p, n.parentId).findIndex(u => u.id === n.id) + 1]; let added: string | null = null; editor.getState().transact(next => { added = addUnit(next, n.parentId!); if (added && nextSibling) reorderUnit(next, added, nextSibling.id); }); if (added && !editor.getState().notice) editor.setState({ selectedId: added, panel: 'edit', inspectorOpen: true }); }}>＋ 同層{kindNames[n.kind]}</button>}
          {n.kind !== 'story' && <><button aria-label="Move selected structure up" disabled={children(p, n.parentId)[0]?.id === id} onClick={() => editor.getState().transact(next => moveSibling(next, id, -1))}>↑ 上移</button><button aria-label="Move selected structure down" disabled={children(p, n.parentId).at(-1)?.id === id} onClick={() => editor.getState().transact(next => moveSibling(next, id, 1))}>↓ 下移</button><button aria-label="Delete selected structure" className="danger" disabled={children(p, n.parentId).length < 2} title={children(p, n.parentId).length < 2 ? '每個容器至少保留一個子單元；可新增另一個或選取父層刪除' : '刪除選取單元及其子單元；需確認，可復原'} onClick={() => deleteSelectedUnit(n)}>刪除</button></>}
          <small>上移／下移調整故事結構及相應呈現區段；不更改世界或理解順序。</small>
        </div>}
        {!closed.has(id) && kids.map((k) => visit(k.id, depth + 1))}
      </div>
    );
  };
  return (
    <aside className={"outline" + (mobile ? " mobile-sheet" : "")} data-widget="story-structure"
      role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined}
      aria-label="Story structure">
      <div className="panel-head">
        <span><AtlasIcon name="structure"/> 故事結構</span>
        {mobile && <button className="sheet-done" onClick={closePanels} aria-label="Close structure">Done</button>}
        <button
          title="Add act"
          aria-label="Add act"
          onClick={() =>
            editor.getState().transact((p) => {
              const id = addUnit(
                p,
                p.units.find((n) => n.kind === "story")!.id,
              );
              if (id)
                editor.setState({
                  selectedId: id,
                  panel: "edit",
                  inspectorOpen: true,
                });
            })
          }
        >
          ＋
        </button>
      </div>
      <div className="outline-scroll" ref={scroll}>
        {visit(p.units.find((n) => n.kind === "story")!.id)}
      </div>
      <div className="outline-footer">
        <details className="structure-legend"><summary><AtlasIcon name="help"/> 圖示與層級</summary><div>{kinds.map(kind => <span key={kind}><KindIcon kind={kind}/>{kindNames[kind]}</span>)}</div><p>拖動同層單元可重排</p></details>
      </div>
    </aside>
  );
}
function Timeline({ mobile = false }: { mobile?: boolean }) {
  const canonical = useEditor((s) => s.project),
    basis = useEditor((s) => s.basis),
    zoom = useEditor((s) => s.zoom),
    playhead = useEditor((s) => s.playhead),
    selected = useEditor((s) => s.selectedId),
    active = useEditor((s) => s.trackId);
  const viewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(850);
  const moved = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    scroll: number;
    top: number;
    distance: number;
    zoom: number;
  } | null>(null);
  const projection = axisView(canonical, basis),
    p = projection.project,
    beats = orderedBeats(p),
    rr = projection.ranges,
    units = visibleUnits(p, zoom),
    scale = scaleAt(zoom),
    labelWidth = mobile ? 96 : 168,
    // A small occurrence/container must still fit a readable card on a phone.
    minimumSpan = Math.min(...units.map((n) => {
      const range = rr.get(n.id)!;
      return range.end - range.start;
    })),
    width = mobile
      ? Math.max(availableWidth, beats.length / minimumSpan * Math.min(246, Math.max(204, availableWidth)))
      : zoom < 25
        ? Math.max(620, availableWidth) * (1 + Math.max(0, zoom - 12) / 25)
        : Math.max(900, beats.length * (45 + zoom * 2));
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setAvailableWidth(Math.max(0, el.clientWidth - labelWidth));
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [labelWidth]);
  const centerCursor = () => {
    const el = viewport.current;
    if (el) el.scrollLeft = Math.max(0,
      (playhead / beats.length) * width - (el.clientWidth - labelWidth) / 2);
  };
  useEffect(centerCursor, [zoom, basis, mobile, width]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const s = editor.getState();
        s.set({ zoom: Math.max(0, Math.min(100, s.zoom - e.deltaY * 0.12)) });
      } else if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const select = (n: Unit) =>
    editor.setState({
      selectedId: (n as ViewUnit).canonicalId,
      occurrenceId: (n as ViewUnit).occurrenceIds[0],
      playhead: rr.get(n.id)!.start + 0.5,
      panel: "cursor",
      inspectorOpen: true,
    });
  const dragProps = (n: Unit) => ({
    draggable: !mobile,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify((n as ViewUnit).occurrenceIds),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      editor.getState().transact((p) => {
        const value = e.dataTransfer.getData("text/plain");
        try {
          const ids = JSON.parse(value);
          if (Array.isArray(ids))
            moveOccurrences(p, basis, ids, (n as ViewUnit).occurrenceIds[0]);
        } catch {
          reorderUnit(p, value, (n as ViewUnit).canonicalId);
        }
      });
    },
  });
  const positionStyle = (n: Unit): CSSProperties => {
    const r = rr.get(n.id)!;
    return {
      left: `calc(${(r.start / beats.length) * 100}% + 6px)`,
      width: `calc(${((r.end - r.start) / beats.length) * 100}% - 12px)`,
    };
  };
  const point = (e: ReactPointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    editor.setState({
      playhead: Math.max(
        0,
        Math.min(
          beats.length,
          ((e.clientX - rect.left) / rect.width) * beats.length,
        ),
      ),
    });
  };
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (
      e.pointerType === "mouse" &&
      (e.button !== 0 || !(e.target as HTMLElement).closest("[data-pan]"))
    )
      return;
    if (
      (e.target as HTMLElement).closest("input,select,textarea") ||
      (e.pointerType === "mouse" && (e.target as HTMLElement).closest("button"))
    )
      return;
    if (!pointers.current.size) moved.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      scroll: viewport.current!.scrollLeft,
      top: viewport.current!.scrollTop,
      distance:
        points.length === 2
          ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          : 0,
      zoom,
    };
    if (points.length > 1) moved.current = true;
    if (e.pointerType === "mouse")
      e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()],
      g = gesture.current;
    if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 7)
      moved.current = true;
    if (moved.current && !e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.setPointerCapture?.(e.pointerId);
    if (points.length === 2) {
      const distance = Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y,
      );
      editor.setState({
        zoom: Math.max(0, Math.min(100, g.zoom + (distance - g.distance) / 4)),
      });
    } else {
      viewport.current!.scrollLeft = g.scroll - (e.clientX - g.x);
      viewport.current!.scrollTop = g.top - (e.clientY - g.y);
    }
  }
  function pointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (e.type === "pointercancel") moved.current = true;
    const remaining = [...pointers.current.values()][0];
    gesture.current = remaining ? {
      x: remaining.x, y: remaining.y,
      scroll: viewport.current!.scrollLeft, top: viewport.current!.scrollTop,
      distance: 0, zoom: editor.getState().zoom,
    } : null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture?.(e.pointerId);
  }
  return (
    <div className="timeline-wrap">
      <div className="canvas-info">
        <span>
          <b>
            {basisLabels[basis]} · {scale}
          </b>
          <span className="separator">/</span>
          <span className="canvas-count">{units.length} containers · {beats.length} occurrences</span>
        </span>
        <button className="center-cursor" onClick={centerCursor}>Locate cursor</button>
        <span className="canvas-hint">
          Drag empty space to pan · Ctrl / ⌘ + wheel to zoom
        </span>
      </div>
      {mobile && <div className="touch-hint">Swipe to explore · Tap a card for details · Pinch to zoom</div>}
      <div
        className="timeline-viewport"
        ref={viewport}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onClickCapture={(e) => {
          if (moved.current) {
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        <div className="timeline-content" style={{ width: width + labelWidth, "--label-width": `${labelWidth}px` } as CSSProperties}>
          <div className="ruler-row">
            <div className="track-label ruler-label">ORDER</div>
            <div
              className="ruler"
              style={{ width }}
              onPointerDown={(e) => {
                e.stopPropagation();
                point(e);
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) point(e);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (e.currentTarget.hasPointerCapture?.(e.pointerId))
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                if (e.currentTarget.hasPointerCapture?.(e.pointerId))
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
              }}
              role="presentation"
            >
              {Array.from({ length: beats.length + 1 }, (_, i) => (
                <span key={i} style={{ left: `${(i / beats.length) * 100}%` }}>
                  {String(i).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
          <details className="editor-structure-context" open={basis === 'narrative'} data-structure-basis={basis}><summary>{basis === 'narrative' ? '呈現結構 · 幕／段落／場' : '作品結構歸屬 · 不代表此線的時間單位'}</summary>
          <div className="band-row">
            <div className="track-label band-label">ACTS</div>
            <div className="band-area" style={{ width }}>
              {p.units
                .filter((n) => n.kind === "act")
                .map((n) => (
                  <button
                    key={n.id}
                    className={
                      "container-band " +
                      (selected === (n as ViewUnit).canonicalId
                        ? "selected"
                        : "")
                    }
                    style={positionStyle(n)}
                    onClick={() => select(n)}
                    {...dragProps(n)}
                    title={n.title + " · " + viewSegmentLabel(projection.units, n as ViewUnit) + " · 拖動重排此段"}
                  >
                    {n.title}{viewSegmentLabel(projection.units, n as ViewUnit) && <small className="container-segment-label">{viewSegmentLabel(projection.units, n as ViewUnit)}</small>}
                  </button>
                ))}
            </div>
          </div>
          {zoom >= 25 && (
            <div className="band-row">
              <div className="track-label band-label">SEQUENCES</div>
              <div className="band-area" style={{ width }}>
                {p.units
                  .filter((n) => n.kind === "sequence")
                  .map((n) => (
                    <button
                      key={n.id}
                      className="container-band sequence-band"
                      style={positionStyle(n)}
                      onClick={() => select(n)}
                      {...dragProps(n)}
                    >
                      {n.title}{viewSegmentLabel(projection.units, n as ViewUnit) && <small className="container-segment-label">{viewSegmentLabel(projection.units, n as ViewUnit)}</small>}
                    </button>
                  ))}
              </div>
            </div>
          )}
          {zoom >= 50 && (
            <div className="band-row">
              <div className="track-label band-label">SCENES</div>
              <div className="band-area" style={{ width }}>
                {p.units
                  .filter((n) => n.kind === "scene")
                  .map((n) => (
                    <button
                      key={n.id}
                      className="container-band scene-band"
                      style={positionStyle(n)}
                      onClick={() => select(n)}
                      {...dragProps(n)}
                    >
                      {n.title}{viewSegmentLabel(projection.units, n as ViewUnit) && <small className="container-segment-label">{viewSegmentLabel(projection.units, n as ViewUnit)}</small>}
                    </button>
                  ))}
              </div>
            </div>
          )}
          </details>
          <div className="tracks-body">
            <div
              className="cursor-line"
              style={{ left: labelWidth + (playhead / beats.length) * width }}
            >
              <span className="cursor-head">{playhead.toFixed(1)}</span>
            </div>
            <div className="track-row objective">
              <div className="track-label">
                <span className="track-icon">◇</span>
                <b>{basisLabels[basis]} order</b>
                <small>
                  {basis === "reality"
                    ? "Canonical world events"
                    : "Shared event occurrences"}
                </small>
              </div>
              <div className="track-surface" data-pan="true" style={{ width }}>
                {units.map((n) => (
                  <button
                    key={n.id}
                    className={
                      "event-card " +
                      (selected === (n as ViewUnit).canonicalId ||
                      descendants(p, n.id).some(
                        (d) => (d as ViewUnit).canonicalId === selected,
                      )
                        ? "selected"
                        : "")
                    }
                    style={positionStyle(n)}
                    onClick={() => select(n)}
                    {...dragProps(n)}
                  >
                    <div className="card-meta">
                      <span className="entity-meta"><KindIcon kind={n.kind}/>
                        {n.kind === "beat"
                          ? canonical.timelines[basis].placements.find(
                              (x) => x.id === n.id,
                            )?.mode
                          : n.kind}
                      </span>
                      {(n.turningPoint ||
                        descendants(p, n.id).some((x) => x.turningPoint)) && (
                        <span className="turn-mark">
                          ◆{" "}
                          {n.kind === "beat"
                            ? "turn"
                            : `${descendants(p, n.id).filter((x) => x.turningPoint).length} turns`}
                        </span>
                      )}
                      <span className="grab">⠿</span>
                    </div>
                    <strong>{n.title}</strong>
                    <p>{n.summary}</p>
                    <span className="card-foot">
                      {n.kind === "beat"
                        ? `B${orderedBeats(canonical).findIndex((x) => x.id === (n as ViewUnit).canonicalId) + 1} · ${p.transitions.filter((t) => t.eventId === n.id).length} state links`
                        : `${rr.get(n.id)!.end - rr.get(n.id)!.start} shared beats`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {p.tracks.filter((track) => !mobile || active === "author" || active === track.id).map((track) => (
              <div
                className={
                  "track-row " +
                  (active !== "author" && active !== track.id ? "subdued" : "")
                }
                key={track.id}
                data-track-id={track.id}
                style={{ "--track-color": track.color } as CSSProperties}
              >
                <div className="track-label">
                  <button
                    className="track-select"
                    onClick={() =>
                      editor.setState({
                        trackId: track.id,
                        panel: "cursor",
                        inspectorOpen: true,
                      })
                    }
                  >
                    <span className="track-icon colored">
                      {track.kind === "audience" ? "◉" : "○"}
                    </span>
                    <b>{track.name}</b>
                  </button>
                  <small>
                    {track.kind === "audience"
                      ? basis === "reality" ? "觀眾理解未對應世界時刻" : "觀眾已寫的理解"
                      : basis === "audience"
                        ? "觀眾對人物的已寫理解"
                        : basis === "narrative"
                          ? "人物在對應世界事件的狀態"
                          : "人物狀態與知道的事"}
                  </small>
                  <button
                    className="track-edit"
                    onClick={() =>
                      editor.setState({
                        trackId: track.id,
                        panel: "track",
                        inspectorOpen: true,
                      })
                    }
                    aria-label={"Edit " + track.name}
                  >
                    Edit track ↗
                  </button>
                </div>
                <div
                  className="track-surface"
                  data-pan="true"
                  style={{ width }}
                >
                  {units.map((n) => {
                    const r = rr.get(n.id)!,
                      arc = projection.trackRange(track.id, r);
                    return (
                      <button
                        className={
                          "arc-card " +
                          (!arc.changes.length ? "no-change" : "") +
                          (selected === (n as ViewUnit).canonicalId
                            ? " selected"
                            : "")
                        }
                        style={positionStyle(n)}
                        key={n.id}
                        onClick={() => {
                          select(n);
                          editor.setState({ trackId: track.id });
                        }}
                        data-state-unit={n.id}
                        data-has-state-change={!!arc.changes.length}
                        title={n.title + " · " + track.name}
                      >
                        <span className="arc-kicker">
                          {arc.changes.length
                            ? `${arc.changes.length} 次已寫更新`
                            : "沿用前一次已寫狀態"}
                        </span>
                        <strong>
                          {arc.changes.length ? <>{arc.before.state}<span className="state-arrow">→</span>{arc.after.state}</> : arc.after.state}
                        </strong>
                        <div className="arc-path">
                          <i />
                          {arc.changes.map((t) => (
                            <span key={t.eventId} title={t.after.state} />
                          ))}
                          <i />
                        </div>
                        <p>
                          {arc.changes.at(-1)?.reaction ||
                            arc.after.goal ||
                            "尚未寫下目標或反應"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div
            className="canvas-space"
            data-pan="true"
            style={{ paddingLeft: labelWidth }}
          >
            {basisDescriptions[basis]}. Dragging changes only this timeline.
            Shared event facts remain linked.
          </div>
        </div>
      </div>
      <div className="scrubber">
        <button
          className="icon-button"
          aria-label="Previous beat"
          onClick={() =>
            editor.setState({
              playhead: Math.max(0, Math.ceil(playhead - 0.5) - 0.5),
            })
          }
        >
          ‹
        </button>
        <input
          type="range"
          min="0"
          max={beats.length}
          step="0.01"
          value={playhead}
          aria-label="Narrative position"
          onChange={(e) =>
            editor.setState({ playhead: Number(e.target.value) })
          }
        />
        <button
          className="icon-button"
          aria-label="Next beat"
          onClick={() =>
            editor.setState({
              playhead: Math.min(
                beats.length,
                Math.floor(playhead + 0.5) + 0.5,
              ),
            })
          }
        >
          ›
        </button>
        <output>
          {playhead.toFixed(2)} / {beats.length}
        </output>
        <span>{basisLabels[basis]} order units, not seconds</span>
      </div>
    </div>
  );
}
function CursorPanel() {
  const p = useEditor((s) => s.project),
    pos = useEditor((s) => s.playhead),
    role = useEditor((s) => s.trackId),
    basis = useEditor((s) => s.basis);
  const list = p.timelines[basis].placements,
    index = Math.min(list.length - 1, Math.max(0, Math.floor(pos))),
    item = list[index],
    event = p.units.find((n) => n.id === item.eventId)!,
    track = p.tracks.find((t) => t.id === role);
  return (
    <div className="inspector-content">
      <div className="eyebrow">
        {basisLabels[basis].toUpperCase()} POSITION {pos.toFixed(2)}
      </div>
      <h2>{track?.name || "Author view"}</h2>
      <div className="current-event">
        <span>
          {pos < index + 0.5 ? "Before" : "After"} occurrence {index + 1} ·{" "}
          {item.mode}
        </span>
        <button
          onClick={() =>
            editor.setState({
              selectedId: event.id,
              occurrenceId: item.id,
              panel: "edit",
            })
          }
        >
          {event.title} ↗
        </button>
        <p>{item.note || event.summary}</p>
        <button
          className="compare-link"
          onClick={() =>
            editor.setState({
              selectedId: event.id,
              occurrenceId: item.id,
              panel: "compare",
            })
          }
        >
          Compare all timelines ↗
        </button>
      </div>
      {track ? (
        <>
          <div className="muted small">
            {stateAtBasis(p, track.id, pos, basis).source}
          </div>
          <SnapshotView
            snapshot={stateAtBasis(p, track.id, pos, basis).snapshot}
          />
        </>
      ) : (
        <>
          <div className="fact">
            <span>Narrative intention</span>
            <p>{event.intent || "Not authored yet"}</p>
          </div>
          <div className="fact">
            <span>Intended audience effect</span>
            <p>{event.audienceEffect || "Not authored yet"}</p>
          </div>
          <div className="fact">
            <span>Authored disclosure · {item.disclosure}</span>
            <p>
              {item.knowledgeNote || "No disclosure note for this occurrence"}
            </p>
          </div>
          <h3>
            {basis === "audience"
              ? "Understanding at this point"
              : "Drives in this moment"}
          </h3>
          {p.tracks.map((t) => {
            const current = stateAtBasis(p, t.id, pos, basis);
            return (
              <button
                className="driver-card"
                key={t.id}
                style={{ "--track-color": t.color } as CSSProperties}
                onClick={() => editor.setState({ trackId: t.id })}
              >
                <div>
                  <b>{t.name}</b>
                  <span>{current.snapshot.state}</span>
                </div>
                <p>
                  {current.snapshot.motivation || "Driving need not authored"}
                </p>
                <small>Goal · {current.snapshot.goal || "Not authored"}</small>
              </button>
            );
          })}
        </>
      )}
      <div className="panel-tip">
        Perspective and time basis are independent. Character truth follows
        Reality; Narrative revisits the mapped world state. Audience
        understanding uses only explicit disclosure snapshots.
      </div>
    </div>
  );
}
function EditPanel() {
  const p = useEditor((s) => s.project),
    id = useEditor((s) => s.selectedId),
    role = useEditor((s) => s.trackId);
  const n = p.units.find((n) => n.id === id) ?? p.units[0],
    rr = ranges(p),
    range = rr.get(n.id)!,
    tx = editor.getState().transact;
  const track = p.tracks.find((t) => t.id === role) ?? p.tracks[0];
  const transition = p.transitions.find(
    (t) => t.eventId === n.id && t.trackId === track?.id,
  );
  const before = track
    ? stateAtBasis(
        p,
        track.id,
        p.timelines.reality.placements.findIndex((x) => x.eventId === n.id) +
          0.499,
        "reality",
      ).snapshot
    : emptySnapshot();
  return (
    <div className="inspector-content">
      <div className="eyebrow">
        {n.kind.toUpperCase()} · UNITS {range.start}–{range.end}
      </div>
      <h2 className="inspector-section-heading"><KindIcon kind={n.kind}/>{kindNames[n.kind]}內容</h2>
      <p className="inspector-scope"><AtlasIcon name="layers"/> 共用內容 · 更新所有對應位置</p>
      <Field
        label="Title"
        value={n.title}
        onSave={(s) => tx((p) => editUnit(p, n.id, { title: s }))}
      />
      <Field
        label="What happens"
        value={n.summary}
        onSave={(s) => tx((p) => editUnit(p, n.id, { summary: s }))}
        multiline
      />
      {n.kind === "beat" && (
        <div className="inline-fields">
          <label className="field">
            <span>Beat type</span>
            <select
              value={n.eventType}
              onChange={(e) =>
                tx((p) =>
                  editUnit(p, n.id, {
                    eventType: e.target.value as Unit["eventType"],
                  }),
                )
              }
            >
              {["action", "dialogue", "foreshadow", "reveal"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={n.turningPoint}
              onChange={(e) =>
                tx((p) => editUnit(p, n.id, { turningPoint: e.target.checked }))
              }
            />{" "}
            Major turn
          </label>
        </div>
      )}
      <Field
        label="Writer's intention"
        value={n.intent}
        onSave={(s) => tx((p) => editUnit(p, n.id, { intent: s }))}
        multiline
      />
      <Field
        label="Intended audience effect"
        value={n.audienceEffect}
        onSave={(s) => tx((p) => editUnit(p, n.id, { audienceEffect: s }))}
        multiline
      />
      {n.kind !== "story" && (
        <>
          <h3 className="inspector-section-heading"><AtlasIcon name="structure"/>故事結構中的位置</h3>
          <label className="field">
            <span>Canonical structure container</span>
            <select
              value={n.parentId!}
              onChange={(e) =>
                tx((p) => {
                  moveToContainer(p, n.id, e.target.value);
                })
              }
            >
              {p.units
                .filter(
                  (x) => kinds.indexOf(x.kind) === kinds.indexOf(n.kind) - 1,
                )
                .map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="button-row">
            <button
              onClick={() => tx((p) => moveSibling(p, n.id, -1))}
              disabled={children(p, n.parentId)[0]?.id === n.id}
            >
              ↑ Earlier
            </button>
            <button
              onClick={() => tx((p) => moveSibling(p, n.id, 1))}
              disabled={children(p, n.parentId).at(-1)?.id === n.id}
            >
              ↓ Later
            </button>
          </div>
        </>
      )}
      {n.kind !== "beat" && (
        <button
          className="wide"
          onClick={() =>
            tx((p) => {
              const id = addUnit(p, n.id);
              if (id) editor.setState({ selectedId: id });
            })
          }
        >
          ＋ Add {kinds[kinds.indexOf(n.kind) + 1]}
        </button>
      )}
      {n.kind === "beat" && (
        <>
          <div className="section-divider" />
          <h3 className="inspector-section-heading"><AtlasIcon name="person"/>人物與視角</h3>
          <p className="muted small">
            One objective event. Each person can interpret it differently.
          </p>
          {p.tracks.length > 0 ? (
            <>
              <select
                aria-label="Perspective to edit"
                className="wide"
                value={track.id}
                onChange={(e) => editor.setState({ trackId: e.target.value })}
              >
                {p.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {p.transitions.some(
                      (x) => x.eventId === n.id && x.trackId === t.id,
                    )
                      ? " · linked"
                      : " · unlinked"}
                  </option>
                ))}
              </select>
              <div className="before-state">
                <span>Before · derived from previous events</span>
                <b>{before.state}</b>
                <p>{before.goal}</p>
              </div>
              {track.kind === "audience" ? (
                <div className="note-block">
                  <p>
                    Audience knowledge belongs to a disclosure occurrence. It
                    does not automatically follow the historical event.
                  </p>
                  <button
                    className="wide"
                    onClick={() => editor.setState({ panel: "compare" })}
                  >
                    Edit audience disclosure ↗
                  </button>
                </div>
              ) : transition ? (
                <>
                  <Field
                    label="Interpretation of this event"
                    value={transition.interpretation}
                    onSave={(s) =>
                      tx((p) =>
                        setTransition(p, {
                          ...clone(transition),
                          interpretation: s,
                        }),
                      )
                    }
                    multiline
                  />
                  <Field
                    label="Reaction / choice"
                    value={transition.reaction}
                    onSave={(s) =>
                      tx((p) =>
                        setTransition(p, { ...clone(transition), reaction: s }),
                      )
                    }
                    multiline
                  />
                  <h3>After this event</h3>
                  <SnapshotFields
                    value={transition.after}
                    onSave={(s) =>
                      tx((p) =>
                        setTransition(p, { ...clone(transition), after: s }),
                      )
                    }
                  />
                  <button
                    className="quiet danger"
                    onClick={() =>
                      tx((p) => {
                        p.transitions = p.transitions.filter(
                          (t) =>
                            !(t.trackId === track.id && t.eventId === n.id),
                        );
                        updateBlueprint(p, n.id);
                      })
                    }
                  >
                    Unlink this perspective
                  </button>
                </>
              ) : (
                <button
                  className="wide accent"
                  onClick={() =>
                    tx((p) =>
                      setTransition(p, {
                        eventId: n.id,
                        trackId: track.id,
                        interpretation: "",
                        reaction: "",
                        after: clone(before),
                      }),
                    )
                  }
                >
                  ＋ Link this shared event
                </button>
              )}
            </>
          ) : (
            <p>Add a perspective track to author a reaction.</p>
          )}
          <details className="compare">
            <summary>Compare character truth at this event</summary>
            {p.transitions
              .filter(
                (t) =>
                  t.eventId === n.id &&
                  p.tracks.find((track) => track.id === t.trackId)?.kind ===
                    "character",
              )
              .map((t) => (
                <div className="comparison" key={t.trackId}>
                  <b>{p.tracks.find((x) => x.id === t.trackId)?.name}</b>
                  <span>
                    {
                      stateAtBasis(
                        p,
                        t.trackId,
                        p.timelines.reality.placements.findIndex(
                          (x) => x.eventId === n.id,
                        ) + 0.499,
                        "reality",
                      ).snapshot.state
                    }{" "}
                    → {t.after.state}
                  </span>
                  <p>
                    <em>Reads it as</em> {t.interpretation || "Not authored"}
                  </p>
                  <p>
                    <em>Responds by</em> {t.reaction || "Not authored"}
                  </p>
                </div>
              ))}
          </details>
        </>
      )}
      {n.kind !== "story" && (
        <>
          <div className="section-divider" />
          <button
            className="quiet danger"
            onClick={() => {
              if (
                confirm(
                  `Delete “${n.title}” and its child units? You can undo this.`,
                )
              )
                tx((p) => removeUnit(p, n.id));
            }}
          >
            Delete {n.kind}
            {n.kind !== "beat" ? " and contents" : ""}
          </button>
        </>
      )}
      <div className="panel-tip">
        Field edits save when you leave the field. Every edit can be undone.
      </div>
    </div>
  );
}
function StagePanel() {
  const p = useEditor((s) => s.project),
    id = useEditor((s) => s.selectedId);
  const n = p.units.find((n) => n.id === id) ?? p.units[0];
  const [key, setKey] = useState<StageName>("blueprint"),
    s = n.stages[key],
    stale =
      key !== "blueprint" &&
      s.blueprintRevision !== n.stages.blueprint.revision,
    tx = editor.getState().transact;
  return (
    <div className="inspector-content">
      <div className="eyebrow">CREATION STAGES</div>
      <h2>{n.title}</h2>
      <p className="muted small">
        故事藍圖與既有演繹筆記保留獨立版本。你可以在這裡審閱自己的設定；演員／導演欄位保留舊資料，不是新故事的必經步驟。
      </p>
      <div className="stage-steps">
        {stages.map((k) => (
          <button
            key={k}
            className={k === key ? "active" : ""}
            onClick={() => setKey(k)}
          >
            <span>
              {k === "blueprint" ? "01" : k === "actor" ? "02" : "03"}
            </span>
            {k === "blueprint"
              ? "Blueprint"
              : k === "actor"
                ? "Actor"
                : "Director"}
          </button>
        ))}
      </div>
      <div className="stage-status">
        <b>{stageNames[key]}</b>
        <Badge className={stale ? "warning" : s.status}>
          {stale ? "Needs review" : s.status}
        </Badge>
      </div>
      <p className="muted small">
        Revision {s.revision}
        {key !== "blueprint"
          ? ` · based on blueprint v${s.blueprintRevision}`
          : ""}
      </p>
      {stale && (
        <div className="warning-box">
          Blueprint is now v{n.stages.blueprint.revision}. This realization
          still references v{s.blueprintRevision}.
          <button onClick={() => tx((p) => rebaseStage(p, n.id, key))}>
            Use current blueprint & reopen draft
          </button>
        </div>
      )}
      <Field
        label={
          key === "blueprint"
            ? "Intent, arc and information goal"
            : key === "actor"
              ? "Action, dialogue and performance choice"
              : "Presentation, rhythm and performance focus"
        }
        value={s.text}
        onSave={(text) => tx((p) => editStage(p, n.id, key, text))}
        multiline
      />
      {key === "blueprint" && (
        <p className="muted small">
          Event facts, writer intention and linked character states belong to
          this blueprint revision. Editing them reopens the draft.
        </p>
      )}
      <div className="button-row">
        <button
          disabled={stale || s.status !== "draft"}
          onClick={() => tx((p) => reviewStage(p, n.id, key))}
        >
          Request review
        </button>
        <button
          className="accent"
          disabled={stale || s.status !== "review"}
          onClick={() => tx((p) => approveStage(p, n.id, key))}
        >
          Approve revision {s.revision}
        </button>
      </div>
      {s.status === "approved" && !stale && (
        <div className="approval-note">
          ✓ This revision is approved. Further edits create a new draft; the
          approved snapshot stays intact.
        </div>
      )}
      <h3>Approved snapshots</h3>
      {s.approvals.length ? (
        s.approvals
          .slice()
          .reverse()
          .map((a, i) => (
            <details className="approval-item" key={i}>
              <summary>
                v{a.revision} · {new Date(a.at).toLocaleDateString()}{" "}
                <span>locked</span>
              </summary>
              <p>{a.text || "(No stage notes)"}</p>
              <small>Blueprint reference: v{a.blueprintRevision}</small>
              <pre>{JSON.stringify(JSON.parse(a.snapshot), null, 2)}</pre>
              <button
                onClick={() =>
                  download(
                    `${n.title}-${key}-approved-v${a.revision}.json`,
                    a.snapshot,
                  )
                }
              >
                Export approved snapshot
              </button>
            </details>
          ))
      ) : (
        <p className="empty-note">No approved snapshots yet</p>
      )}
      <div className="panel-tip">
        Local approval records your decision. It does not claim a team identity,
        external signature or production approval.
      </div>
    </div>
  );
}
function TrackPanel() {
  const p = useEditor((s) => s.project),
    role = useEditor((s) => s.trackId),
    t = p.tracks.find((t) => t.id === role);
  const tx = editor.getState().transact;
  const add = () =>
    tx((p) => {
      const id = uid();
      p.tracks.push({
        id,
        name: "New perspective",
        kind: "character",
        color: "#87b9df",
        description: "",
        initial: emptySnapshot(),
      });
      updateBlueprint(p, p.units.find(n => n.kind === "story")!.id);
      editor.setState({ trackId: id });
    });
  if (!t)
    return (
      <div className="inspector-content">
        <h2>Perspective tracks</h2>
        <p>
          Each track carries an authored state across the shared story. Add a
          character or an audience perspective.
        </p>
        <button className="accent" onClick={add}>
          ＋ Add perspective
        </button>
      </div>
    );
  const patch = (v: Partial<Track>) =>
    tx((p) => {
      Object.assign(
        p.tracks.find((x) => x.id === t.id)!,
        v,
      );
      updateBlueprint(p, p.units.find((n) => n.kind === "story")!.id);
    });
  return (
    <div className="inspector-content">
      <div className="eyebrow">PERSPECTIVE TRACK</div>
      <h2>{t.name}</h2>
      <Field label="Name" value={t.name} onSave={(name) => patch({ name })} />
      <div className="inline-fields">
        <label className="field">
          <span>Perspective type</span>
          <select
            value={t.kind}
            onChange={(e) => patch({ kind: e.target.value as Track["kind"] })}
          >
            <option value="character">Character</option>
            <option value="audience">Audience</option>
          </select>
        </label>
        <label className="field">
          <span>Color</span>
          <input
            aria-label="Track color"
            type="color"
            value={t.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
      </div>
      <Field
        label="Arc / track notes"
        value={t.description}
        onSave={(description) => patch({ description })}
        multiline
      />
      <h3>Initial state</h3>
      <p className="muted small">
        Used before the first linked event. Later snapshots carry forward across
        containers.
      </p>
      <SnapshotFields
        value={t.initial}
        onSave={(initial) => patch({ initial })}
      />
      <button className="wide" onClick={add}>
        ＋ Add another perspective
      </button>
      <button
        className="quiet danger"
        onClick={() => {
          if (
            confirm(
              `Delete “${t.name}”, its event links and content tracks owned by/about this perspective? Shared events stay intact. You can undo this.`,
            )
          )
            tx((p) => {
              p.tracks = p.tracks.filter((x) => x.id !== t.id);
              p.transitions = p.transitions.filter((x) => x.trackId !== t.id);
              updateBlueprint(p, p.units.find(n => n.kind === "story")!.id);
              editor.setState({ trackId: "author" });
            });
        }}
      >
        Delete perspective track
      </button>
    </div>
  );
}
function switchBasis(basis: TimeBasis) {
  const s = editor.getState();
  const list = s.project.timelines[basis].placements;
  if (!list.length) { editor.setState({ basis, occurrenceId: "", playhead: 0 }); return; }
  const exact = basis === s.basis ? list.find(o => o.id === s.occurrenceId && o.eventId === s.selectedId) : undefined;
  if (exact) { editor.setState({ playhead: list.indexOf(exact) + .5 }); return; }
  const currentEvent =
    s.panel === "compare"
      ? s.selectedId
      : s.project.timelines[s.basis].placements[
          Math.min(
            s.project.timelines[s.basis].placements.length - 1,
            Math.floor(s.playhead),
          )
        ]?.eventId;
  const same =
    list.find((x) => x.eventId === currentEvent) ??
    list[Math.min(list.length - 1, Math.floor(s.playhead))];
  const index = list.indexOf(same);
  editor.setState({
    basis,
    playhead: index + 0.5,
    occurrenceId: same.id,
    selectedId: same.eventId,
  });
}
function TimeBasisBar() {
  const basis = useEditor((s) => s.basis),
    p = useEditor((s) => s.project);
  const checks = diagnostics(p);
  return (
    <div className="time-basis-bar">
      <span className="axis-label">畫布順序</span>
      <div className="basis-tabs" role="group" aria-label="Timeline basis">
        {bases.map((key) => (
          <button
            key={key}
            aria-pressed={basis === key}
            className={basis === key ? "active" : ""}
            onClick={() => switchBasis(key)}
          >
            {basisLabels[key]}{" "}
            <small>{p.timelines[key].placements.length}</small>
          </button>
        ))}
      </div>
      <span className="basis-description">{basisDescriptions[basis]}</span>
      <button
        className="comparison-toggle"
        aria-label="Compare & inspect"
        onClick={() =>
          editor.setState({ panel: "compare", inspectorOpen: true })
        }
      >
        <span className="compare-label-desktop">開啟位置側欄</span><span className="compare-label-mobile">位置側欄</span>{" "}
        <span>{checks.length ? `${checks.length} checks` : "linked"}</span>
      </button>
    </div>
  );
}
function CraftPrompts({ basis }: { basis: TimeBasis }) {
  return (
    <details className="craft-prompts">
      <summary>Optional craft questions</summary>
      <p>
        <b>Order</b> · What does delaying or revisiting this event change for
        the reader?
      </p>
      <p>
        <b>Frequency</b> · If an event appears again, what new meaning earns the
        repetition?
      </p>
      <p>
        <b>Pace</b> · Should this moment play out, compress, pause, or be
        omitted?
      </p>
      <p>
        <b>Focalization</b> · Whose access to information limits this telling?
        Knowing, seeing and speaking need not belong to the same person.
      </p>
      <p>
        <b>Action</b> · What does the character want now, and what blocks the
        next choice?
      </p>
      <small>
        Questions adapted from narratology and drama teaching; optional, not a
        plot formula. Sources in Help.{" "}
        {basis === "audience"
          ? "Audience is our working model of disclosure, not a claim about every viewer."
          : ""}
      </small>
    </details>
  );
}
function ComparePanel() {
  const p = useEditor((s) => s.project),
    basis = useEditor((s) => s.basis),
    selected = useEditor((s) => s.selectedId),
    selectedOccurrence = useEditor((s) => s.occurrenceId),
    role = useEditor((s) => s.trackId);
  const node = p.units.find((n) => n.id === selected) ?? p.units[0];
  const event =
    node.kind === "beat"
      ? node
      : (descendants(p, node.id).find((n) => n.kind === "beat") ??
        orderedBeats(p)[0]);
  const maps = eventMappings(p, event.id),
    list = p.timelines[basis].placements;
  const occurrence =
    list.find((x) => x.id === selectedOccurrence && x.eventId === event.id) ??
    list.find((x) => x.eventId === event.id);
  const index = occurrence ? list.indexOf(occurrence) : -1;
  const track =
    p.tracks.find((t) => t.id === role) ??
    p.tracks.find((t) => t.kind === "audience") ??
    p.tracks[0];
  const update = occurrence?.updates.find((x) => x.trackId === track?.id);
  const canAuthor =
    !!track &&
    basis !== "reality" &&
    (basis === "audience" || track.kind === "audience");
  const tx = editor.getState().transact;
  const checks = diagnostics(p);
  const patch = (patch: Partial<Omit<Occurrence, "id" | "eventId">>) =>
    tx((p) => patchOccurrence(p, basis, occurrence!.id, patch));
  const go = (target: TimeBasis, id: string, eventId: string) => {
    const at = p.timelines[target].placements.findIndex((x) => x.id === id);
    editor.setState({
      basis: target,
      occurrenceId: id,
      selectedId: eventId,
      playhead: at + 0.5,
      panel: "compare",
    });
  };
  return (
    <div className="inspector-content">
      <div className="eyebrow">ONE EVENT · THREE ORDERS</div>
      <h2 aria-label="Time & disclosure" className="inspector-section-heading"><AtlasIcon name="path"/>位置與呈現</h2>
      <label className="field">
        <span>Canonical shared event</span>
        <select
          value={event.id}
          onChange={(e) =>
            editor.setState({ selectedId: e.target.value, occurrenceId: "" })
          }
        >
          {orderedBeats(p).map((n, i) => (
            <option key={n.id} value={n.id}>
              {i + 1} · {n.title}
            </option>
          ))}
        </select>
      </label>
      {basis === "reality" && <RealityTimingEditor eventId={event.id}/>}
      <div className="mapping-list">
        {maps.map((mapping) => (
          <div
            className={
              "mapping-row " + (mapping.basis === basis ? "active" : "")
            }
            key={mapping.basis}
          >
            <b>{basisLabels[mapping.basis]}</b>
            <div>
              {mapping.items.length ? (
                mapping.items.map(({ item, index }) => (
                  <button
                    key={item.id}
                    onClick={() => go(mapping.basis, item.id, event.id)}
                    className={item.id === occurrence?.id ? "active" : ""}
                  >
                    {index + 1} · {item.mode}
                  </button>
                ))
              ) : (
                <span>Not mapped</span>
              )}
            </div>
            <button
              className="add-mapping"
              aria-label={"Add occurrence to " + basisLabels[mapping.basis]}
              disabled={mapping.basis === "reality" && mapping.items.length > 0}
              onClick={() =>
                tx((p) => {
                  const id = addOccurrence(p, mapping.basis, event.id);
                  editor.setState({
                    basis: mapping.basis,
                    occurrenceId: id,
                    playhead:
                      p.timelines[mapping.basis].placements.length - 0.5,
                  });
                })
              }
            >
              ＋
            </button>
          </div>
        ))}
      </div>
      <p className="inspector-scope"><AtlasIcon name="path"/>改動這次呈現，僅影響「{basisNames[basis]}」</p>
      {occurrence && (
        <>
          <div className="section-divider" />
          <div className="eyebrow">
            <AtlasIcon name={basis}/> {basisNames[basis]} · 第 {index + 1} 次呈現
          </div>
          <div className="button-row">
            <button
              disabled={index === 0}
              onClick={() =>
                tx((p) =>
                  moveOccurrences(
                    p,
                    basis,
                    [occurrence.id],
                    list[index - 1].id,
                  ),
                )
              }
            >
              ↑ Earlier
            </button>
            <button
              disabled={index === list.length - 1}
              onClick={() =>
                tx((p) =>
                  moveOccurrences(
                    p,
                    basis,
                    [occurrence.id],
                    list[index + 1].id,
                  ),
                )
              }
            >
              ↓ Later
            </button>
          </div>
          <div className="inline-fields">
            <label className="field">
              <span>Order treatment</span>
              <select
                value={occurrence.mode}
                onChange={(e) =>
                  patch({ mode: e.target.value as Occurrence["mode"] })
                }
              >
                {[
                  "present",
                  "flashback",
                  "flashforward",
                  "repeat",
                  "disclosure",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Presentation pace</span>
              <select
                value={occurrence.pacing}
                onChange={(e) =>
                  patch({ pacing: e.target.value as Occurrence["pacing"] })
                }
              >
                {["scene", "summary", "ellipsis", "pause"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Container on this timeline</span>
            <select
              value={occurrence.containerId}
              onChange={(e) => patch({ containerId: e.target.value })}
            >
              {p.units
                .filter((n) => n.kind === "scene")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
            </select>
          </label>
          <Field
            label={
              basis === "reality"
                ? "World time / context note"
                : "Presentation / context note"
            }
            value={occurrence.note}
            onSave={(note) => patch({ note })}
            multiline
          />
          {basis !== "reality" && (
            <>
              <label className="field">
                <span>Information given to audience</span>
                <select
                  value={occurrence.disclosure}
                  onChange={(e) =>
                    patch({
                      disclosure: e.target.value as Occurrence["disclosure"],
                    })
                  }
                >
                  {["withheld", "partial", "misleading", "confirmed"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
              <Field
                label="What is disclosed or reinterpreted?"
                value={occurrence.knowledgeNote}
                onSave={(knowledgeNote) => patch({ knowledgeNote })}
                multiline
              />
              <button
                className="wide"
                onClick={() =>
                  tx((p) => {
                    const id = addOccurrence(p, basis, event.id, index + 1);
                    patchOccurrence(p, basis, id, {
                      mode: "repeat",
                      containerId: occurrence.containerId,
                    });
                    editor.setState({
                      occurrenceId: id,
                      playhead: index + 1.5,
                    });
                  })
                }
              >
                ＋ Present this event again
              </button>
            </>
          )}
          <h3>
            {basis === "audience"
              ? "Authored audience understanding"
              : "Perspective at this occurrence"}
          </h3>
          {track ? (
            <>
              <select
                className="wide"
                aria-label="Occurrence state perspective"
                value={track.id}
                onChange={(e) => editor.setState({ trackId: e.target.value })}
              >
                {p.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {canAuthor ? (
                <>
                  {update ? (
                    <>
                      <Field
                        label="Interpretation at this occurrence"
                        value={update.interpretation}
                        onSave={(interpretation) =>
                          tx((p) =>
                            setOccurrenceState(p, basis, occurrence.id, {
                              ...clone(update),
                              interpretation,
                            }),
                          )
                        }
                        multiline
                      />
                      <Field
                        label="Response / revision of belief"
                        value={update.reaction}
                        onSave={(reaction) =>
                          tx((p) =>
                            setOccurrenceState(p, basis, occurrence.id, {
                              ...clone(update),
                              reaction,
                            }),
                          )
                        }
                        multiline
                      />
                      <SnapshotFields
                        value={update.after}
                        onSave={(after) =>
                          tx((p) =>
                            setOccurrenceState(p, basis, occurrence.id, {
                              ...clone(update),
                              after,
                            }),
                          )
                        }
                      />
                      <button
                        className="quiet danger"
                        onClick={() =>
                          patch({
                            updates: occurrence.updates.filter(
                              (x) => x.trackId !== track.id,
                            ),
                          })
                        }
                      >
                        Remove this occurrence's snapshot
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="muted small">
                        No new snapshot here. The earlier authored understanding
                        carries forward.
                      </p>
                      <button
                        className="wide accent"
                        onClick={() =>
                          tx((p) =>
                            setOccurrenceState(p, basis, occurrence.id, {
                              trackId: track.id,
                              interpretation: "",
                              reaction: "",
                              after: clone(
                                stateAtBasis(p, track.id, index + 0.499, basis)
                                  .snapshot,
                              ),
                            }),
                          )
                        }
                      >
                        Author a change in understanding
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="muted small">
                    {basis === "reality" && track.kind === "audience"
                      ? "World order does not imply what the audience knows. Switch to Audience or Narrative to author disclosure."
                      : "Character truth comes from the mapped Reality event, not the order in which it is shown."}
                  </p>
                  {track.kind === "character" && (
                    <button
                      className="wide"
                      onClick={() =>
                        editor.setState({ selectedId: event.id, panel: "edit" })
                      }
                    >
                      Edit canonical character state ↗
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="muted small">
              Add a perspective in the Track panel first.
            </p>
          )}
          <button
            className="quiet danger"
            onClick={() => {
              if (
                confirm(
                  "Remove this occurrence only? The canonical event and other timelines remain. You can undo.",
                )
              )
                tx((p) => removeOccurrence(p, basis, occurrence.id));
            }}
          >
            Remove occurrence from {basisLabels[basis]}
          </button>
        </>
      )}
      <CraftPrompts basis={basis} />
      <details className="diagnostics">
        <summary>Structural checks · {checks.length}</summary>
        <p className="muted small">
          Deterministic checks of your mappings and labels. An omission or time
          jump may be intentional. No automatic judgment of story quality.
        </p>
        {checks.length ? (
          checks.map((check, i) => (
            <button
              key={i}
              onClick={() => {
                const item = p.timelines[check.basis].placements.find(
                  (x) => x.id === check.occurrenceId,
                );
                editor.setState({
                  basis: check.basis,
                  selectedId: check.eventId ?? item?.eventId ?? event.id,
                  occurrenceId: item?.id ?? "",
                  playhead: item
                    ? p.timelines[check.basis].placements.indexOf(item) + 0.5
                    : 0,
                });
              }}
            >
              <b>
                {basisLabels[check.basis]} · {check.kind}
              </b>
              <span>{check.message}</span>
            </button>
          ))
        ) : (
          <p>No structural gaps or label conflicts found.</p>
        )}
      </details>
    </div>
  );
}

function Inspector({ mobile = false }: { mobile?: boolean }) {
  const { panel, project, selectedId, basis, occurrenceId } = useEditor(s => s);
  const selected = project.units.find(n => n.id === selectedId);
  const at = project.timelines[basis].placements.findIndex(o => o.id === occurrenceId && o.eventId === selectedId);
  const tabNames = { cursor: "At cursor", edit: "Event", compare: "Time", stages: "Stages", track: "Track", lines: "敘事線", tracking: "Content tracking" };
  const tabLabels = { cursor: "此刻", edit: "內容", compare: "位置", stages: "版本", track: "視角", lines: "敘事線", tracking: "追蹤" };
  const tabIcons: Record<keyof typeof tabLabels, AtlasIconName> = { cursor: "clock", edit: "edit", compare: "path", stages: "layers", track: "person", lines: "sequence", tracking: "layers" };
  return (
    <aside className={"inspector" + (mobile ? " mobile-sheet" : "")} data-widget="selection-inspector"
      role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined}
      aria-label="Story details">
      {mobile && <div className="sheet-header"><div><span>DETAILS</span><b>{editor.getState().project.units.find(n => n.id === editor.getState().selectedId)?.title}</b></div><button onClick={closePanels} aria-label="Close inspector">Done</button></div>}
      {!mobile && <div className="inspector-selection-context" aria-label="Selected editing context"><div>{selected && <KindIcon kind={selected.kind}/>}<strong>{selected?.title || "選取單元"}</strong></div><small><AtlasIcon name={basis}/>{basisNames[basis]}{at >= 0 ? ` · #${at + 1}` : " · 尚無對應位置"}</small></div>}
      <div className="inspector-tabs" data-control-region="inspector" aria-label="切換右側選取詳情">
        {(["cursor", "edit", "compare", "stages", "track", "lines", "tracking"] as const).map(
          (key) => (
            <button
              className={panel === key ? "active" : ""}
              onClick={() => editor.setState({ panel: key })}
              key={key}
              aria-label={tabNames[key]}
              title={`右側面板：${({cursor:'查看此刻狀態',edit:'編輯所有位置共用的事件內容',compare:'編輯這次呈現與順序',stages:'查看編劇、演員與導演版本',track:'編輯視角開場設定',lines:'管理自訂故事線',tracking:'編輯對象、維度與此刻的追蹤內容'})[key]}`}
              aria-pressed={panel === key}
            >
              <AtlasIcon name={tabIcons[key]}/><span>{tabLabels[key]}</span>
            </button>
          ),
        )}
      </div>
      {!mobile && <button
        className="mobile-close"
        aria-label="Close inspector"
        onClick={() => editor.setState({ inspectorOpen: false })}
      >
        ×
      </button>}
      {panel === "tracking" ? (<StoryTracksPanel />) : panel === "lines" ? (
        <NarrativeLinesPanel />
      ) : panel === "cursor" ? (
        <CursorPanel />
      ) : panel === "edit" ? (
        <EditPanel />
      ) : panel === "compare" ? (
        <ComparePanel />
      ) : panel === "stages" ? (
        <StagePanel />
      ) : (
        <TrackPanel />
      )}
    </aside>
  );
}
export default function App() {
  const mobile = usePhoneLayout();
  const [view, setView] = useState<"story" | "author" | "timelines" | "focus" | "3d">("story");
  const holographic = view === "3d";
  const setHolographic = (value: boolean) => setView(value ? "3d" : "focus");
  const [audienceExperience, setAudienceExperience] = useState(false);
  const currentBasis = useEditor((s) => s.basis);
  useEffect(()=>{if(currentBasis!=="audience")setAudienceExperience(false);},[currentBasis]);
  const p = useEditor((s) => s.project),
    zoom = useEditor((s) => s.zoom),
    role = useEditor((s) => s.trackId),
    past = useEditor((s) => s.past.length),
    future = useEditor((s) => s.future.length),
    status = useEditor((s) => s.saveStatus),
    notice = useEditor((s) => s.notice),
    outline = useEditor((s) => s.outlineOpen),
    inspector = useEditor((s) => s.inspectorOpen);
  const input = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  const [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false);
  useEffect(() => {
    const off = registerWebMCP();
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        commitFocusedField();
        setHelp(false);
        setSettings(false);
        if (phoneLayoutNow()) closePanels();
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        e.target.matches("input,textarea,select")
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? editor.getState().redo() : editor.getState().undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.getState().redo();
      }
      if (e.key === "Escape") {
        setHelp(false);
        setSettings(false);
      }
    };
    const flushAndSave = () => {
      commitFocusedField();
      saveNow();
    };
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") flushAndSave(); };
    window.addEventListener("keydown", key);
    window.addEventListener("pagehide", flushAndSave);
    document.addEventListener("visibilitychange", saveWhenHidden);
    if (window.innerWidth < 900)
      editor.setState({ outlineOpen: false, inspectorOpen: false });
    return () => {
      importRequest.current++;
      off();
      window.removeEventListener("keydown", key);
      window.removeEventListener("pagehide", flushAndSave);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, []);
  useEffect(() => {
    if (mobile) editor.setState({ outlineOpen: false, inspectorOpen: false, zoom: zoomFor("Beats") });
  }, [mobile]);
  useEffect(() => {
    if (mobile && inspector && outline) editor.setState({ outlineOpen: false });
  }, [mobile, inspector, outline]);
  const sheetOpen = mobile && (inspector || outline);
  function newStory() {
    commitFocusedField();
    if (!confirm("建立空白故事？目前作品可用復原取回，建議先匯出 JSON 備份。")) return false;
    editor.getState().importProject(createBlankProject());
    setView("author"); setAudienceExperience(false); setSettings(false); closePanels();
    return true;
  }
  function closeSettings() { commitFocusedField(); setSettings(false); }
  function exportBackup() {
    commitFocusedField();
    saveNow();
    const current = editor.getState().project;
    download(`${current.title || "narrative"}-atlas.json`, JSON.stringify(current, null, 2));
    editor.setState({ notice: "JSON backup exported." });
  }
  useEffect(() => {
    if (!help && !settings && !sheetOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector(
      help || settings ? ".modal[role=dialog]" : ".mobile-sheet[role=dialog]",
    ) as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
        ) ?? [],
      ).filter(node => {
        if (node.closest('[hidden],[inert]')) return false;
        // Closed details expose only their own summary to keyboard navigation.
        for (let parent = node.parentElement; parent && parent !== dialog; parent = parent.parentElement) {
          if (parent.matches('details:not([open])') && parent.querySelector(':scope > summary') !== node) return false;
        }
        return true;
      });
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [help, settings, sheetOpen, outline]);
  const canvasTools = <>
{!audienceExperience && view === "timelines" && <div className="aligned-toolbar" data-control-region="comparison-canvas" inert={sheetOpen || help || settings ? true : undefined}>
        <button className="panel-trigger" aria-label="Toggle structure" title="展開／收起左側故事結構" aria-pressed={outline} onClick={() => editor.setState({ outlineOpen: !outline })}><AtlasIcon name="structure"/><span>故事結構</span></button>
        <strong>三種順序對照</strong>
        <label className="canvas-perspective-filter"><AtlasIcon name="person"/><span>視角</span><select aria-label="View as perspective" value={role} onChange={e => editor.setState({ trackId: e.target.value })}><option value="author">全部視角</option>{p.tracks.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
      </div>}
      {!audienceExperience && (view === "focus" || view === "3d") && (mobile ? <div inert={sheetOpen || help || settings ? true : undefined}><button className="return-aligned" onClick={() => setView("timelines")}>回到三線對照</button><MobileTimelineControls onBasis={switchBasis} holographic={holographic} onView={() => setHolographic(!holographic)} /></div> : <div className="workspace-bar" data-control-region="timeline-canvas" inert={sheetOpen || help || settings ? true : undefined}>
        <button className="return-aligned" onClick={() => setView("timelines")}>三線對照</button>
        <button
          className={"icon-button " + (outline ? "active" : "")}
          aria-label="Toggle structure"
          title="Structure"
          onClick={() => editor.setState({ outlineOpen: !outline, ...(mobile ? { inspectorOpen: false } : {}) })}
        >
          ☷
        </button>
        <button className={"holo-toggle " + (holographic ? "active" : "")} aria-pressed={holographic} onClick={() => { setHolographic(!holographic); if (!holographic) editor.setState({outlineOpen:false,inspectorOpen:false}); }}>◈ {holographic ? "3D view" : "3D hologram"}</button>
        <div className="scale-tabs" aria-label="Semantic zoom level" title="只改變中央畫布的細節層級">
          {(["Story", "Sequences", "Scenes", "Beats"] as Scale[]).map((s) => (
            <button
              key={s}
              className={scaleAt(zoom) === s ? "active" : ""}
              aria-pressed={scaleAt(zoom) === s}
              onClick={() => editor.setState({ zoom: zoomFor(s) })}
              aria-label={s}
              title={{Story:"故事",Sequences:"段落",Scenes:"場",Beats:"事件"}[s]}
            >
              <AtlasIcon name={{Story:"story",Sequences:"sequence",Scenes:"scene",Beats:"beat"}[s] as Kind}/><span>{{Story:"故事",Sequences:"段落",Scenes:"場",Beats:"事件"}[s]}</span>
            </button>
          ))}
        </div>
        <div className="zoom-controls">
          <button
            aria-label="Zoom out"
            onClick={() => editor.setState({ zoom: Math.max(0, zoom - 12) })}
          >
            −
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={zoom}
            aria-label="Semantic zoom"
            onChange={(e) => editor.setState({ zoom: Number(e.target.value) })}
          />
          <button
            aria-label="Zoom in"
            onClick={() => editor.setState({ zoom: Math.min(100, zoom + 12) })}
          >
            ＋
          </button>
        </div>
        <div className="perspective-picker">
          <span><AtlasIcon name="person"/> 視角</span>
          <select
            aria-label="View as perspective"
            value={role}
            onChange={(e) =>
              editor.setState({
                trackId: e.target.value,
                panel: "cursor",
              })
            }
          >
            <option value="author">Author · all perspectives</option>
            {p.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className={"inspect-toggle panel-trigger " + (inspector ? "active" : "")}
          aria-label="Inspect ◫"
          title="展開／收起右側選取詳情；中央檢視不變"
          onClick={() => editor.setState({ inspectorOpen: !inspector })}
        >
          選取詳情 <span>◫</span>
        </button>
      </div>)}
      {!audienceExperience && (view === "focus" || view === "3d") && !mobile && <div className="basis-container" inert={sheetOpen || help || settings ? true : undefined}><TimeBasisBar /></div>}
  </>;
  return (
    <div className={"app" + (mobile ? " is-mobile" : "")}>
      <header className="topbar" inert={sheetOpen || help || settings ? true : undefined}>
        <div className="brand-mark">
          <span>╱</span>
          <span>╲</span>
        </div>
        <div className="brand">
          <b>STRAND</b>
          <button onClick={() => setSettings(true)}>
            {p.title}
            <span>⌄</span>
          </button>
        </div>
        <span className="save-status">
          <i />
          {status}
        </span>
        <div className="top-actions">
          <button
            className="icon-button"
            aria-label="Undo"
            title="Undo · Ctrl/⌘ Z"
            disabled={!past}
            onClick={() => editor.getState().undo()}
          >
            ↶
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            title="Redo · Ctrl/⌘ Shift Z"
            disabled={!future}
            onClick={() => editor.getState().redo()}
          >
            ↷
          </button>
          <span className="divider" />
          <button className="desktop-file-action" onClick={() => input.current?.click()}>匯入</button>
          <button
            className="desktop-file-action"
            onClick={exportBackup}
          >
            備份 ↗
          </button>
          <button
            className="help-button"
            aria-label="Help"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            const request = ++importRequest.current;
            e.target.value = "";
            if (!file) return;
            commitFocusedField();
            const source = editor.getState().project;
            try {
              if (file.size > 8_000_000)
                throw new Error("Import files must be smaller than 8 MB.");
              const text = await file.text();
              if (request !== importRequest.current) return;
              commitFocusedField();
              if (source !== editor.getState().project) {
                editor.setState({ notice: "讀檔期間作品已變更，這次匯入未套用。若仍要匯入，請重新選取檔案。" });
                return;
              }
              const next = parseProject(text);
              if (
                confirm(
                  "Replace the current project with this validated import? Undo will restore the current project.",
                )
              )
                editor.getState().importProject(next);
            } catch (err) {
              if (request === importRequest.current) editor.setState({ notice: (err as Error).message });
            }
          }}
        />
      </header>
      <nav className="workspace-modes" data-control-region="workspace" aria-label="工作模式" inert={sheetOpen || help || settings ? true : undefined}>
        <button aria-label="Build story blueprint" aria-pressed={view === "author" && !audienceExperience} onClick={() => { setView("author"); setAudienceExperience(false); closePanels(); }}><AtlasIcon name="edit"/><span>搭建故事</span></button>
        <button aria-pressed={view === "story" && !audienceExperience} onClick={() => { setView("story"); setAudienceExperience(false); closePanels(); }}><AtlasIcon name="story"/><span>讀懂故事</span></button>
        <button aria-label="Compare story orders" aria-pressed={view === "timelines" && !audienceExperience} onClick={() => { setView("timelines"); setAudienceExperience(false); closePanels(); }}><AtlasIcon name="path"/><span>對照與編排</span></button>
        <div className="workspace-view-options" data-tool-scope="workspace" role="group" aria-label="其他工作區檢視">
          <button aria-label="Single timeline editor" aria-pressed={!audienceExperience && view === "focus"} title="切換中央工作區：單線細節編輯" onClick={() => { setView("focus"); setAudienceExperience(false); }}><AtlasIcon name="edit"/>單線編輯</button>
          <button aria-label="◎ 觀眾體驗 · 情緒／認知／預期" aria-pressed={audienceExperience} title="切換中央工作區：觀眾情緒與理解" onClick={() => { setAudienceExperience(true); switchBasis("audience"); closePanels(); }}><AtlasIcon name="audience"/>觀眾體驗</button>
          <button aria-label="Timeline workbench" aria-pressed={!audienceExperience && view === "3d"} title="切換中央工作區：三線總覽、播放與空間投影" onClick={() => { setView("3d"); setAudienceExperience(false); closePanels(); }}><AtlasIcon name="layers"/>時間線工作台</button>
        </div>
      </nav>
      <main
        className={
          "workspace " + ((view === "story" || view === "author") && !audienceExperience ? "story-workspace " : "") +
          (outline ? "with-outline " : "") +
          (inspector ? "with-inspector" : "")
        }
      >
        {outline && <Outline mobile={mobile} />}
        <div className="timeline-main" data-widget="central-workspace" inert={sheetOpen || help || settings ? true : undefined}><div className="workspace-edge-tools" data-tool-scope="sidebar"><button data-opens-sidebar="left" title="開啟左側故事結構；中央檢視不變" onClick={() => editor.setState({outlineOpen: !outline, ...(mobile ? {inspectorOpen: false} : {})})}><AtlasIcon name="structure"/>故事結構 <span>{outline ? '收起左欄' : '開啟左欄'}</span></button><button data-opens-sidebar="right" aria-label="Edit narrative lines" title="開啟右側故事線管理；中央檢視不變" onClick={() => openLine()}><AtlasIcon name="sequence"/>故事線 <span>開啟右欄</span></button></div>{view !== "3d" && canvasTools}<div className="canvas-body">{audienceExperience ? <AudienceExperience onAtlas={()=>{setAudienceExperience(false); setView("timelines");}} /> : view === "author" ? <StoryAuthoring mobile={mobile} onNew={newStory} onRead={() => setView("story")} onArrange={() => setView("timelines")} onAdvanced={() => { setAudienceExperience(true); switchBasis("audience"); closePanels(); }}/> : view === "story" ? <StoryReader onNew={newStory} mobile={mobile} onArrange={() => setView("timelines")} onAdvanced={() => { setAudienceExperience(true); switchBasis("audience"); closePanels(); }} /> : view === "timelines" ? <AlignedTimelines mobile={mobile} onAudience={() => { setAudienceExperience(true); switchBasis("audience"); editor.setState({ outlineOpen: false, inspectorOpen: false }); }} /> : holographic ? <Hologram onFlat={() => setHolographic(false)} spatialTools={canvasTools} /> : <div className="flat-with-lines"><LineStrip/>{mobile ? <MobileTimeline /> : <Timeline />}</div> }</div></div>
        {sheetOpen && <button className="sheet-backdrop" aria-label="Back to timeline" tabIndex={-1} onClick={closePanels} />}
        {inspector && <Inspector mobile={mobile} />}
      </main>
      {mobile && view !== "story" && view !== "author" && <nav className="mobile-dock" aria-label="Workspace panels" inert={sheetOpen || help || settings ? true : undefined}>
        <button onClick={() => editor.setState({ outlineOpen: true, inspectorOpen: false })}>☷ <span>Structure</span></button>
        <button onClick={() => editor.setState({ inspectorOpen: true, outlineOpen: false })}>◫ <span>Details</span></button>
        <button onClick={() => setSettings(true)}>⋯ <span>Project</span></button>
        <button onClick={() => setHelp(true)}>？ <span>Help</span></button>
      </nav>}
      <footer className={"statusbar" + ((view === "story" || view === "author") ? " reader-statusbar" : "")} inert={sheetOpen || help || settings ? true : undefined}>
        <span>
          <span className="dot mint" /> LOCAL-FIRST <i>·</i>{" "}
          {p.units.filter((n) => n.kind === "act").length} acts <i>·</i>{" "}
          {p.units.filter((n) => n.kind === "scene").length} scenes <i>·</i>{" "}
          {p.tracks.length} perspectives
        </span>
        <span>
          Blueprint → realization <i>·</i> Your review, your approval
        </span>
        <button onClick={() => setHelp(true)}>Shortcuts & guide</button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => editor.setState({ notice: "" })}
          >
            ×
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Strand guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              onClick={() => setHelp(false)}
              aria-label="Close help"
            >
              ×
            </button>
            <div className="eyebrow">QUICK GUIDE</div>
            <h2>先搭建故事，再驗證它如何被理解</h2>
            <p>「搭建故事」從發生什麼、為什麼、造成什麼開始。場的目標、對抗與改變，人物選擇與主題關係都可選填；溝通先寫成第三人稱的行動與影響概要，不要求逐句台詞。</p>
            <p>「讀懂故事」一次只讀一種順序：故事怎麼發生、觀眾怎麼看到、觀眾怎麼理解。每個事件分開顯示已寫下的原因、行動與結果；空白會直接標示，不會把相鄰事件推測成因果。人物處境可展開查看。</p>
            <p>想比較同一事件的位置，切到「對照與編排」。上方檢視列可切換單線編輯、觀眾體驗與三線總覽；工作區兩側的按鈕開啟故事結構和故事線。完整虛構示例可隨時閱讀，不會取代目前作品。</p>
            <ol>
              <li>
                <b>Zoom changes what you see.</b> Story shows acts and arc
                turns; Sequences and Scenes reveal their containers; Beats shows
                action, dialogue and evidence.
              </li>
              <li>
                <b>One axis, many perspectives.</b> Objective events are shared.
                Link a beat to a character or audience track and author its
                interpretation, reaction and after-state.
              </li>
              <li>
                <b>Move the cursor, switch roles.</b> The panel shows the latest
                authored state at that position. Units measure narrative order,
                not screen time.
              </li>
              <li>
                <b>Move a container, carry its story.</b> Drag like units in the
                outline or timeline; children and perspective links follow.
                Earlier/Later buttons work on touch and keyboard.
              </li>
              <li>
                <b>Separate intent from realization.</b> Select a unit, open
                Stages, review a draft, then approve it. Approved snapshots stay
                immutable; changed blueprints flag dependent realizations.
              </li>
            </ol>
            <p className="muted">
              Swipe across the timeline to explore. Tap a card to open details;
              Done returns to the same position. Pinch with two fingers or use
              Story / Sequences / Scenes / Beats to change scale. On a phone,
              View as focuses one perspective. Use Time → Earlier / Later to
              reorder without dragging. Ctrl/⌘ Z undoes an edit. Export JSON for backup
              or moving devices.
            </p>
            <p className="muted">
              The Time Basis bar switches Reality, Narrative and Audience order.
              The Time inspector compares one event across all three, adds
              repeated presentations and authors disclosure snapshots. Projects
              autosave only in this browser. There is no cloud sync or
              multi-user approval in this version.
            </p>
            <div className="sources-list">
              <h3>Craft references</h3>
              <p>
                <a
                  href="https://www-archiv.fdm.uni-hamburg.de/lhn/node/106.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Scheffel, Weixler & Werner · Time
                </a>
                : story order and telling order can differ; order, duration and
                frequency are distinct questions. This informs independent
                occurrences, time-jump labels and optional pace notes.
              </p>
              <p>
                <a
                  href="https://www-archiv.fdm.uni-hamburg.de/lhn/node/18.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Niederhoff · Focalization
                </a>
                : perspective involves access to information. This informs
                separate character truth and explicitly authored audience
                understanding.
              </p>
              <p>
                <a
                  href="https://cpercy.artsci.utoronto.ca/courses/220KeyTermsDefinitions.htm"
                  target="_blank"
                  rel="noreferrer"
                >
                  University of Toronto · Drama key terms
                </a>
                : objectives, obstacles and tactical action provide practical
                questions for a beat. They inform the goal / obstacle / response
                prompts.
              </p>
              <p>
                The Audience timeline is this app's design for testing
                disclosure, not a standard third timeline prescribed by these
                authors. Diagnostics check your data and labels, not artistic
                quality. The three-act example is optional; no fixed plot
                formula is enforced. Pace labels are qualitative notes, not
                measured duration.
              </p>
            </div>
            <a
              className="button-link"
              href="/strand-source.zip"
              download
            >
              Download source & README ↗
            </a>
          </section>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={closeSettings}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Project settings"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              onClick={closeSettings}
              aria-label="Close settings"
            >
              ×
            </button>
            <h2>Project</h2>
            <p className="project-save-status" role="status">{status}</p>
            <div className="project-file-actions">
              <button onClick={() => input.current?.click()}>Import JSON</button>
              <button onClick={exportBackup}>Export JSON ↗</button>
            </div>
            <Field
              label="Project title"
              value={p.title}
              onSave={(title) =>
                editor.getState().transact((p) => {
                  editStoryContext(p, { title });
                })
              }
            />
            <Field
              label="Premise"
              value={p.premise}
              onSave={(premise) =>
                editor.getState().transact((p) => {
                  editStoryContext(p, { premise });
                })
              }
              multiline
            />
            <button
              onClick={() => {
                commitFocusedField();
                if (
                  confirm(
                    "Load the original sample? Your current project can be restored with Undo. Export a backup first if needed.",
                  )
                ) {
                  editor.getState().importProject(createTimelineDemo());
                  setSettings(false);
                }
              }}
            >
              Load original sample
            </button>
            <button className="wide" onClick={newStory}>New blank story</button>
            <p className="muted small">
              Edits stay on this device. Export JSON before clearing your
              browser data.
            </p>
            <ServerWorkspace />
          </section>
        </div>
      )}
    </div>
  );
}
