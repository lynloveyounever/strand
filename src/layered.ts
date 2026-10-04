import type { Project, Unit } from './model';
import { cursorOccurrence, occurrenceMappings, type TimelineCursor } from './playback';
import { bases, type Occurrence, type TimeBasis } from './temporal';

export type LayerSpacing = 'compact' | 'spread';
export const layeredAxisTitles: Record<TimeBasis, string> = {
  reality: '故事發生', narrative: '觀眾看到', audience: '觀眾理解',
};
export const layeredCardWidth = 196;
export const layeredCardGap = 10;

/** Fixed parallel projection of a display layer, never of a shared story clock. */
export function layeredProjection(layer: number, spacing: LayerSpacing, mobile = false) {
  const bounded = Math.max(0, Math.min(bases.length - 1, Math.trunc(Number.isFinite(layer) ? layer : 0)));
  const step = mobile ? (spacing === 'spread' ? 9 : 5) : (spacing === 'spread' ? 28 : 14);
  return { x: bounded * step, backX: step, backY: -Math.max(4, Math.round(step * .55)), depth: bounded };
}

/** Each axis owns its ordinal positions. Equal x never establishes simultaneity. */
export function layeredOccurrenceX(index: number) {
  return Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0)) * (layeredCardWidth + layeredCardGap);
}

export function layeredCardText(event: Unit | undefined, item: Occurrence, basis: TimeBasis) {
  if (!event) return { label: '事件資料', text: '找不到這個共用事件', source: 'missing' as const };
  if (basis === 'reality') return { label: '發生的事', text: event.summary.trim() || '尚未寫下事件內容', source: 'event' as const };
  if (basis === 'narrative') return item.note.trim()
    ? { label: '這次呈現', text: item.note, source: 'occurrence' as const }
    : { label: '沿用共用敘述', text: event.summary.trim() || '這次呈現尚無文字', source: 'event' as const };
  // Modern blanks are authored blanks, not permission to fall back to world truth.
  if (item.audienceDesign) return {
    label: '作者設定 · 相信', text: item.audienceDesign.cognition.believes.trim() || '尚未寫下相信的解釋', source: 'design' as const,
  };
  return { label: '理解備註', text: item.knowledgeNote.trim() || '此理解節點尚無備註', source: 'occurrence' as const };
}

export function layeredPlanes(project: Project, cursor: TimelineCursor | null, previewCursor: TimelineCursor | null = null) {
  const reference = cursorOccurrence(project, cursor);
  const validPreview = cursorOccurrence(project, previewCursor);
  const shownCursor = validPreview ? previewCursor : reference ? cursor : null;
  const shown = cursorOccurrence(project, shownCursor);
  const mappings = shownCursor ? occurrenceMappings(project, shownCursor) : [];
  const events = new Map(project.units.map(event => [event.id, event]));
  return bases.map((basis, layer) => {
    const list = project.timelines[basis].placements;
    const totals = new Map<string, number>(), seen = new Map<string, number>();
    list.forEach(item => totals.set(item.eventId, (totals.get(item.eventId) ?? 0) + 1));
    return { basis, layer, mapping: mappings.find(m => m.basis === basis), hasReference: !!shown,
      items: list.map((item, index) => {
        const event = events.get(item.eventId), repeatIndex = (seen.get(item.eventId) ?? 0) + 1;
        seen.set(item.eventId, repeatIndex);
        return { item, event, index, cursor: { basis, occurrenceId: item.id }, repeatIndex, repeatCount: totals.get(item.eventId)!,
          exact: shownCursor?.basis === basis && shownCursor.occurrenceId === item.id,
          reference: !!reference && cursor?.basis === basis && cursor.occurrenceId === item.id,
          preview: !!validPreview && previewCursor?.basis === basis && previewCursor.occurrenceId === item.id,
          related: !!shown && shown.item.eventId === item.eventId,
          content: layeredCardText(event, item, basis),
        };
      }),
    };
  });
}
