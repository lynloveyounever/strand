import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDemo } from './sample';
import { clone, parseProject } from './model';
import { stateAtBasis } from './temporal';
import { authoredState, cursorOccurrence, initialPlaybackCursor, nearestOccurrence, occurrenceMappings, referenceFrame, stepCursor } from './playback';

test('reference cursor cold opening maps identity rather than equal ordinal world time', () => {
  const p = createTimelineDemo(), cursor = initialPlaybackCursor(p)!;
  const frame = referenceFrame(p, cursor)!;
  assert.equal(frame.item.id, 'narrative-opening'); assert.equal(frame.event.id, 'e9');
  assert.equal(frame.mappings[0].candidates[0].item.id, 'reality-e9');
  assert.equal(frame.mappings[1].status, 'multiple'); assert.equal(frame.mappings[1].exactId, 'narrative-opening');
  assert.equal(frame.mappings[2].status, 'missing');
  assert.deepEqual(frame.audience[0].snapshot, p.tracks.find(t => t.id === 'audience')!.initial);
  assert.equal(frame.audience[0].sourceEvent, undefined);
  assert.deepEqual(frame.characters[0].snapshot, stateAtBasis(p, 'lin', 8.5, 'reality').snapshot);
});
test('repeated audience occurrences remain multiple and none is silently selected', () => {
  const p = createTimelineDemo(), mappings = occurrenceMappings(p, { basis: 'narrative', occurrenceId: 'narrative-e1' });
  assert.equal(mappings[2].status, 'multiple'); assert.equal(mappings[2].candidates.length, 2); assert.equal(mappings[2].exactId, undefined);
  const exact = occurrenceMappings(p, { basis: 'audience', occurrenceId: 'audience-disclosure-3' });
  assert.equal(exact[2].exactId, 'audience-disclosure-3'); assert.equal(exact[2].candidates.length, 2);
});
test('forward/back reference scrubbing restores authored snapshots without future leakage', () => {
  const p = createTimelineDemo(), before = JSON.stringify(p);
  const earlier = referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-e1' })!;
  const later = referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-e11' })!;
  assert.equal(later.audience[0].sourceEvent?.id, 'e10'); assert.equal(later.audience[0].sourceIndex, 10);
  assert.notDeepEqual(later.audience[0].snapshot, earlier.audience[0].snapshot);
  assert.deepEqual(referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-e1' })!.audience[0].snapshot, earlier.audience[0].snapshot);
  assert.notDeepEqual(earlier.characters[0].snapshot, referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-opening' })!.characters[0].snapshot);
  assert.equal(JSON.stringify(p), before);
});
test('explicit blank state replaces prior knowledge, prose and independent designs never promote to known', () => {
  const p = createTimelineDemo(), update = p.timelines.narrative.placements[5].updates[0];
  update.after = { state: '', knowledge: '', motivation: '', goal: '', obstacle: '' };
  p.timelines.narrative.placements[6].knowledgeNote = 'PROSE NOT A STATE';
  p.timelines.audience.placements[0].audienceDesign!.cognition.knows = 'FUTURE PRIVATE DISCLOSURE';
  const frame = referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-e6' })!;
  assert.equal(frame.audience[0].snapshot.knowledge, ''); assert.equal(frame.audience[0].snapshot.state, '');
  assert.equal(frame.audience[0].sourceEvent?.id, 'e5');
});
test('all audience tracks stay separate and world order has no audience clock', () => {
  const p = createTimelineDemo(); const audience = clone(p.tracks.find(t => t.id === 'audience')!);
  audience.id = 'other-audience'; audience.initial.knowledge = 'Separate'; p.tracks.push(audience);
  const frame = referenceFrame(p, { basis: 'narrative', occurrenceId: 'narrative-e5' })!;
  assert.equal(frame.audience.length, 2); assert.equal(frame.audience[1].snapshot.knowledge, 'Separate');
  assert.equal(referenceFrame(p, { basis: 'reality', occurrenceId: 'reality-e5' })!.audience.length, 0);
});
test('missing world mapping yields unknown, never initial character certainty', () => {
  const p = createTimelineDemo(); p.timelines.reality.placements = p.timelines.reality.placements.filter(o => o.eventId !== 'e9');
  const c = { basis: 'narrative' as const, occurrenceId: 'narrative-opening' };
  assert.equal(referenceFrame(p, c)!.characters.length, 0);
  assert.equal(authoredState(p, p.tracks[0], c)!.unknown, true);
});
test('stable occurrence cursor follows reorder, stops at edges and invalidates deletion', () => {
  const p = createTimelineDemo(), cursor = { basis: 'narrative' as const, occurrenceId: 'narrative-e9' };
  const list = p.timelines.narrative.placements; list.unshift(list.splice(9, 1)[0]);
  assert.equal(cursorOccurrence(p, cursor)!.index, 0); assert.deepEqual(stepCursor(p, cursor, -1), cursor);
  assert.equal(stepCursor(p, cursor, 1)!.occurrenceId, 'narrative-opening');
  list.shift(); assert.equal(cursorOccurrence(p, cursor), null); assert.equal(stepCursor(p, cursor, 1), null);
});
test('pointer hit testing only selects the nearest occurrence on the chosen axis', () => {
  const p = createTimelineDemo(), list = p.timelines.audience.placements;
  assert.equal(nearestOccurrence(list, -1), list[0]); assert.equal(nearestOccurrence(list, .5), list[3]); assert.equal(nearestOccurrence(list, 1), list.at(-1));
  assert.equal(nearestOccurrence([], .2), null); assert.equal(nearestOccurrence(list, NaN), null);
});
test('cursor and preview need no schema migration and leave JSON intact', () => {
  const p = createTimelineDemo(), raw = JSON.stringify(p), parsed = parseProject(raw);
  referenceFrame(parsed, initialPlaybackCursor(parsed));
  assert.equal(JSON.stringify(parsed), raw);
  const legacy = clone(p) as any; legacy.schemaVersion = 1; delete legacy.timelines;
  const migrated = parseProject(JSON.stringify(legacy));
  assert.ok(initialPlaybackCursor(migrated)); assert.ok(referenceFrame(migrated, initialPlaybackCursor(migrated)));
  assert.equal(Object.hasOwn(migrated, 'playback'), false);
});
