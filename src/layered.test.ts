import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDemo } from './sample';
import { layeredCardGap, layeredCardText, layeredCardWidth, layeredOccurrenceX, layeredPlanes, layeredProjection } from './layered';

test('fixed projection spaces categorical layers without rotating text or sharing a clock', () => {
  assert.deepEqual(layeredProjection(0, 'spread'), { x: 0, backX: 28, backY: -15, depth: 0 });
  assert.equal(layeredProjection(2, 'spread').x, 56);
  assert.equal(layeredProjection(2, 'compact').x, 28);
  assert.equal(layeredProjection(2, 'spread', true).x, 18);
  assert.equal(layeredProjection(2, 'compact', true).x, 10);
  assert.equal(layeredOccurrenceX(2), 2 * (layeredCardWidth + layeredCardGap));
  for (const n of [NaN, Infinity, -1, 999]) assert.ok(Object.values(layeredProjection(n, 'spread')).every(Number.isFinite));
  assert.equal(layeredOccurrenceX(NaN), 0);
});
test('cold opening retains exact presentation and maps event identity across independent orders', () => {
  const p = createTimelineDemo(), planes = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'narrative-opening' });
  assert.deepEqual(planes.map(p => p.items.length), [16, 17, 7]);
  assert.equal(planes[0].items.find(n => n.related)!.index, 8);
  assert.equal(planes[1].items.find(n => n.exact)!.index, 0);
  assert.equal(planes[2].mapping?.status, 'missing');
  assert.equal(planes[2].items.some(n => n.related), false);
  assert.equal(planes[0].items.some(n => n.exact), false);
});
test('repeated placements keep distinct cursors and occurrence-specific content', () => {
  const p = createTimelineDemo(), nodes = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'narrative-e9' })[1].items.filter(n => n.related);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map(n => n.repeatIndex), [1, 2]);
  assert.deepEqual(nodes.map(n => n.repeatCount), [2, 2]);
  assert.equal(nodes[0].exact, false); assert.equal(nodes[1].exact, true);
  assert.notEqual(nodes[0].content.text, nodes[1].content.text);
  assert.notEqual(nodes[0].cursor.occurrenceId, nodes[1].cursor.occurrenceId);
});
test('preview changes identity emphasis while preserving the reference exact occurrence', () => {
  const p = createTimelineDemo(), planes = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'narrative-e9' }, { basis: 'audience', occurrenceId: 'audience-disclosure-3' });
  const flat = planes.flatMap(p => p.items);
  assert.equal(flat.filter(n => n.exact).length, 1);
  assert.equal(flat.find(n => n.exact)!.item.id, 'audience-disclosure-3');
  assert.equal(flat.find(n => n.reference)!.item.id, 'narrative-e9');
  assert.equal(flat.find(n => n.preview)!.item.id, 'audience-disclosure-3');
  assert.equal(planes[2].mapping?.status, 'multiple');
  assert.equal(planes[2].mapping?.exactId, 'audience-disclosure-3');
});
test('stale previews fall back to the reference and deleted references remain unselected', () => {
  const p = createTimelineDemo();
  const planes = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'narrative-opening' }, { basis: 'audience', occurrenceId: 'gone' });
  assert.equal(planes[1].items.find(n => n.exact)!.item.id, 'narrative-opening');
  assert.equal(planes.flatMap(p => p.items).some(n => n.preview), false);
  const missing = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'gone' });
  assert.equal(missing.some(p => p.hasReference), false);
  assert.equal(missing.some(p => p.mapping), false);
  assert.equal(missing.flatMap(p => p.items).some(n => n.exact || n.related || n.reference), false);
});
test('authored blank audience design cannot leak legacy prose or world truth', () => {
  const p = createTimelineDemo(), item = p.timelines.audience.placements[0], event = p.units.find(e => e.id === item.eventId)!;
  item.audienceDesign!.cognition.believes = '';
  item.knowledgeNote = 'SECRET LEGACY'; event.summary = 'SECRET WORLD';
  assert.deepEqual(layeredCardText(event, item, 'audience'), { label: '作者設定 · 相信', text: '尚未寫下相信的解釋', source: 'design' });
  delete item.audienceDesign;
  assert.equal(layeredCardText(event, item, 'audience').text, 'SECRET LEGACY');
  item.knowledgeNote = '';
  assert.equal(layeredCardText(event, item, 'audience').text, '此理解節點尚無備註');
});
test('projection derives from the live project and never adds or mutates records', () => {
  const p = createTimelineDemo(), before = JSON.stringify(p), cursor = { basis: 'narrative' as const, occurrenceId: 'narrative-e9' };
  const item = p.timelines.narrative.placements.find(o => o.id === cursor.occurrenceId)!;
  const first = layeredPlanes(p, cursor)[1].items.find(n => n.exact)!;
  assert.equal(first.item, item); assert.equal(first.event, p.units.find(e => e.id === item.eventId));
  layeredPlanes(p, cursor, { basis: 'audience', occurrenceId: 'audience-disclosure-3' });
  assert.equal(JSON.stringify(p), before);
  p.timelines.narrative.placements.unshift(p.timelines.narrative.placements.splice(first.index, 1)[0]);
  assert.equal(layeredPlanes(p, cursor)[1].items.find(n => n.exact)!.index, 0);
});
test('empty timelines and missing canonical records are explicit rather than invented', () => {
  const p = createTimelineDemo(); p.timelines.audience.placements = [];
  p.units = p.units.filter(u => u.id !== 'e9');
  const planes = layeredPlanes(p, { basis: 'narrative', occurrenceId: 'narrative-opening' });
  assert.equal(planes[2].items.length, 0); assert.equal(planes[2].mapping?.status, 'missing');
  assert.equal(planes[1].items[0].content.source, 'missing');
  assert.equal(planes[1].items[0].event, undefined);
});
