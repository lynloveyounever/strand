import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AtlasIcon, basisNames } from './AtlasIcon';
import type { Project } from './model';
import type { TimelineCursor } from './playback';
import { occurrenceMode } from './storyReading';
import { layeredAxisTitles, layeredCardGap, layeredCardWidth, layeredOccurrenceX, layeredPlanes, layeredProjection, type LayerSpacing } from './layered';

export type LayeredViewProps = {
  project: Project;
  active?: boolean;
  cursor: TimelineCursor | null;
  previewCursor?: TimelineCursor | null;
  /** The navigator owns canonical selection, single-line focus and return history. */
  onSelect: (cursor: TimelineCursor, element?: HTMLElement) => void;
  onPreview?: (cursor: TimelineCursor | null) => void;
};

/** Display-only view of the same exact occurrences used by the overview and 3D. */
export default function LayeredView({ project, active = true, cursor, previewCursor = null, onSelect, onPreview }: LayeredViewProps) {
  const [spacing, setSpacing] = useState<LayerSpacing>('spread');
  const root = useRef<HTMLElement>(null), helpId = useId(), located = useRef<string | null>(null);
  const planes = useMemo(() => layeredPlanes(project, cursor, previewCursor), [project, cursor, previewCursor]);
  const currentEvent = planes.flatMap(p => p.items).find(item => item.exact)?.event;
  const isPreviewing = planes.some(plane => plane.items.some(item => item.preview));
  useEffect(() => {
    if (!active || root.current?.closest('[hidden]')) return;
    const key = cursor ? cursor.basis + ':' + cursor.occurrenceId : null;
    if (!key || located.current === key) return;
    // Follow only the stable reference. A hover must never move the surface under a pointer.
    const node = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-layered-reference="true"]') ?? [])[0];
    const rail = node?.closest<HTMLElement>('.layered-view__rail');
    if (node && rail && rail.clientWidth > 0) {
      located.current = key;
      // Adjust only this horizontal rail; scrollIntoView could jump the containing navigator.
      const left = Number(node.dataset.layeredX), right = left + layeredCardWidth;
      if (left < rail.scrollLeft || right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = Math.max(0, left - (rail.clientWidth - layeredCardWidth) / 2);
    }
  }, [active, project, cursor?.basis, cursor?.occurrenceId]);
  function enter(next: TimelineCursor, element: HTMLElement) { onPreview?.(null); onSelect(next, element); }
  function keyMove(event: KeyboardEvent<HTMLButtonElement>, index: number, length: number) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onPreview?.(null); return; }
    const next = event.key === 'ArrowRight' ? Math.min(length - 1, index + 1) : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const buttons = event.currentTarget.closest('ol')?.querySelectorAll<HTMLButtonElement>('[data-layered-occurrence]');
    buttons?.[next]?.focus({ preventScroll: true });
    const rail = event.currentTarget.closest<HTMLElement>('.layered-view__rail');
    if (rail && rail.clientWidth > 0) {
      const left = layeredOccurrenceX(next), right = left + layeredCardWidth;
      if (left < rail.scrollLeft) rail.scrollLeft = left;
      else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth;
    }
  }
  return <section ref={root} className="layered-view" aria-label="2.5D 分層對照" aria-describedby={helpId} data-layer-spacing={spacing}>
    <header className="layered-view__heading">
      <div><h3><AtlasIcon name="layers"/>2.5D 分層對照</h3><p>固定視角 · 點選卡片進入單線</p></div>
      <div className="layered-view__controls" role="group" aria-label="2.5D 層距"><span>層距</span><button aria-pressed={spacing === 'compact'} onClick={() => setSpacing('compact')}>緊密</button><button aria-pressed={spacing === 'spread'} onClick={() => setSpacing('spread')}>展開</button></div>
    </header>
    <div className="layered-view__key"><span><i className="layered-view__reference-mark"/>播放基準</span><span><i className="layered-view__related-mark"/>同一事件</span>{isPreviewing && <span>暫看中 · 移開回到播放基準</span>}<strong>{currentEvent?.title ?? '請選擇要對照的節點'}</strong></div>
    <div className="layered-view__planes" onPointerLeave={() => onPreview?.(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreview?.(null); }}>
      {planes.map(plane => {
        const desktop = layeredProjection(plane.layer, spacing), mobile = layeredProjection(plane.layer, spacing, true);
        const count = plane.mapping?.candidates.length ?? 0;
        const style = { '--layer-offset': `${desktop.x}px`, '--layer-offset-mobile': `${mobile.x}px`, '--layer-back-x-desktop': `${desktop.backX}px`, '--layer-back-y-desktop': `${desktop.backY}px`, '--layer-back-x-mobile': `${mobile.backX}px`, '--layer-back-y-mobile': `${mobile.backY}px`, '--layer-card-width': `${layeredCardWidth}px`, '--layer-card-gap': `${layeredCardGap}px` } as CSSProperties;
        return <section key={plane.basis} className="layered-view__plane" style={style} data-layered-basis={plane.basis} data-layer-depth={plane.layer} data-mapping-status={plane.mapping?.status ?? 'unselected'}>
          <div className="layered-view__plane-face">
            <header className="layered-view__plane-heading"><h4><AtlasIcon name={plane.basis}/>{layeredAxisTitles[plane.basis]}</h4><span>{basisNames[plane.basis]} · {plane.items.length} 個節點</span><small>{plane.basis === 'reality' ? '依排列顯示' : '依這條線的順序'}</small></header>
            <div className="layered-view__rail" role="group" aria-label={`${layeredAxisTitles[plane.basis]}的分層事件軌`}>
              {plane.items.length ? <ol>{plane.items.map(node => <li key={node.item.id}><button
                data-layered-occurrence={node.item.id} data-layered-x={layeredOccurrenceX(node.index)} data-event-id={node.item.eventId}
                data-layered-exact={node.exact} data-layered-reference={node.reference} data-layered-preview={node.preview} data-layered-related={node.related}
                aria-label={`${layeredAxisTitles[plane.basis]}第 ${node.index + 1} 個節點：${node.event?.title ?? '事件不存在'}${node.repeatCount > 1 ? `；同一事件在這條線第 ${node.repeatIndex} / ${node.repeatCount} 次` : ''}；點選進入`}
                aria-current={node.exact ? 'step' : undefined} title={`${node.event?.title ?? '事件不存在'}\n${node.content.label}：${node.content.text}`}
                onClick={event => enter(node.cursor, event.currentTarget)}
                onPointerEnter={event => { if (event.pointerType !== 'touch') onPreview?.(node.cursor); }}
                onFocus={() => onPreview?.(node.cursor)} onKeyDown={event => keyMove(event, node.index, plane.items.length)}>
                <span className="layered-view__card-meta"><span>{String(node.index + 1).padStart(2, '0')}</span><span>{node.reference ? '◆ 播放基準' : node.preview ? '暫看' : node.related ? '同一事件' : occurrenceMode[node.item.mode]}</span></span>
                <b>{node.event?.title ?? '事件不存在'}</b>
                <span className="layered-view__card-copy"><small>{node.content.label}</small><span>{node.content.text}</span></span>
                <span className="layered-view__card-footer">{node.repeatCount > 1 ? `同一事件 · 第 ${node.repeatIndex} / ${node.repeatCount} 次` : occurrenceMode[node.item.mode]}<span aria-hidden="true">↗</span></span>
              </button></li>)}</ol> : <p className="layered-view__empty">這條線尚無節點</p>}
            </div>
            <div className="layered-view__mapping"><small>{!plane.hasReference ? '尚未選擇對照事件' : count === 0 ? '此事件尚無對應節點' : plane.mapping?.exactId ? '目前確切節點' : count > 1 ? `同一事件有 ${count} 個對應，請選擇哪一次` : '同一事件的對應節點'}</small>{plane.mapping?.candidates.map(({ item, index }) => <button key={item.id} data-layered-mapping={item.id} onClick={event => enter({ basis: plane.basis, occurrenceId: item.id }, event.currentTarget)}>第 {index + 1} 個節點{plane.mapping?.exactId === item.id ? ' · 目前' : ''} ↗</button>)}</div>
          </div>
        </section>;
      })}
    </div>
    <p id={helpId} className="layered-view__note">層次只區分三條線；橫向是各線的排列位置，不是共同時間或因果。文字保持平面，可左右捲動；鍵盤用方向鍵暫看、Enter 進入。</p>
  </section>;
}
