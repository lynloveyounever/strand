import type { Project, Track } from './model';
import { bases, stateAtBasis, type Occurrence, type TimeBasis } from './temporal';

/** Inspection, hover and the playback reference are separate, occurrence-addressed cursors. */
export type TimelineCursor = { basis: TimeBasis; occurrenceId: string };
export function cursorOccurrence(p: Project, cursor: TimelineCursor | null) {
  if (!cursor) return null;
  const list = p.timelines[cursor.basis].placements;
  const index = list.findIndex(o => o.id === cursor.occurrenceId);
  return index < 0 ? null : { item: list[index], index };
}
export function occurrenceMappings(p: Project, cursor: TimelineCursor) {
  const current = cursorOccurrence(p, cursor);
  return bases.map(basis => {
    const candidates = current ? p.timelines[basis].placements.flatMap((item, index) => item.eventId === current.item.eventId ? [{ item, index }] : []) : [];
    return { basis, candidates, status: candidates.length === 0 ? 'missing' as const : candidates.length === 1 ? 'unique' as const : 'multiple' as const,
      exactId: basis === cursor.basis ? current?.item.id : undefined };
  });
}
export function stepCursor(p: Project, cursor: TimelineCursor | null, delta: number): TimelineCursor | null {
  const current = cursorOccurrence(p, cursor);
  if (!cursor || !current) return null;
  const list = p.timelines[cursor.basis].placements;
  return { basis: cursor.basis, occurrenceId: list[Math.max(0, Math.min(list.length - 1, current.index + delta))].id };
}
export function initialPlaybackCursor(p: Project, selection?: TimelineCursor): TimelineCursor | null {
  if (selection?.basis === 'narrative' && cursorOccurrence(p, selection)) return selection;
  const item = p.timelines.narrative.placements[0];
  return item ? { basis: 'narrative', occurrenceId: item.id } : null;
}
/** Ordinal hit-testing stays on the hovered axis. It does not map clocks by index. */
export function nearestOccurrence(list: readonly Occurrence[], fraction: number) {
  if (!list.length || !Number.isFinite(fraction)) return null;
  return list[Math.max(0, Math.min(list.length - 1, Math.floor(fraction * list.length)))];
}
export function authoredState(p: Project, track: Track, cursor: TimelineCursor) {
  const current = cursorOccurrence(p, cursor);
  if (!current || (cursor.basis === 'reality' && track.kind === 'audience')) return null;
  const state = stateAtBasis(p, track.id, current.index + .5, cursor.basis);
  const sourceBasis = cursor.basis === 'narrative' && track.kind === 'character' ? 'reality' : cursor.basis;
  const sourceItem = sourceBasis === 'reality'
    ? p.timelines.reality.placements.find(o => o.eventId === state.eventId)
    : p.timelines[sourceBasis].placements.find(o => o.id === state.occurrenceId);
  const sourceIndex = sourceItem ? p.timelines[sourceBasis].placements.indexOf(sourceItem) : -1;
  const sourceEvent = sourceItem ? p.units.find(u => u.id === sourceItem.eventId) : undefined;
  const unknown = track.kind === 'character' && cursor.basis === 'narrative' && !p.timelines.reality.placements.some(o => o.eventId === current.item.eventId);
  return { track, ...state, sourceBasis, sourceIndex, sourceEvent, unknown };
}
export function referenceFrame(p: Project, cursor: TimelineCursor | null) {
  const current = cursorOccurrence(p, cursor);
  if (!cursor || !current) return null;
  const mappings = occurrenceMappings(p, cursor);
  const world = mappings.find(m => m.basis === 'reality')!;
  const worldCursor = world.status === 'unique' ? { basis: 'reality' as const, occurrenceId: world.candidates[0].item.id } : null;
  return { cursor, ...current, event: p.units.find(u => u.id === current.item.eventId)!, mappings,
    characters: worldCursor ? p.tracks.filter(t => t.kind === 'character').map(t => authoredState(p, t, worldCursor)!) : [],
    // Audience snapshots only advance along their authored timeline. No knowledge unions,
    // implied disclosure from event identity, or inference from prose / private world truth.
    audience: cursor.basis === 'reality' ? [] : p.tracks.filter(t => t.kind === 'audience').map(t => authoredState(p, t, cursor)!),
  };
}
