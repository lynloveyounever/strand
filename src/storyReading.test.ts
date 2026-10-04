import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSample, createTimelineDemo } from './sample';
import { approveStage, clone, parseProject, removeUnit, reviewStage, validateProject } from './model';
import { makeStore, readSavedProject } from './store';
import { readingContext, readingSentence } from './storyReading';

test('first visit opens the first world event rather than a late reveal', () => {
  const s = makeStore(createTimelineDemo()).getState();
  assert.equal(s.basis,'reality'); assert.equal(s.selectedId,'e1'); assert.equal(s.playhead,.5);
});
test('sample has distinct scene summaries and a complete explicit cause action outcome route', () => {
  const p = createTimelineDemo();validateProject(p);
  assert.equal(new Set(p.units.filter(u=>u.kind==='scene').map(u=>u.summary)).size,8);
  for(const event of p.units.filter(u=>u.kind==='beat')) {
    assert.ok(event.summary);assert.ok(event.storyLogic?.cause);assert.ok(event.storyLogic?.outcome);
    if(event.storyLogic?.causeEventId) assert.ok(p.units.some(u=>u.id===event.storyLogic!.causeEventId));
  }
  assert.match(p.units.find(u=>u.id==='e12')!.summary,/打開.*側門.*逃出/);
  assert.match(p.units.find(u=>u.id==='e16')!.summary,/調查告一段落後/);
});
test('presentation and audience repeated occurrences carry different readable content',()=>{
  const p=createTimelineDemo(),event=p.units.find(u=>u.id==='e9')!;
  const [first,second]=p.timelines.narrative.placements.filter(o=>o.eventId==='e9');
  assert.match(readingSentence(event,first,'narrative',p),/尚不知道/);
  assert.match(readingSentence(event,second,'narrative',p),/已知道/);
  const light=p.units.find(u=>u.id==='e1')!, [early,later]=p.timelines.audience.placements.filter(o=>o.eventId==='e1');
  assert.notEqual(readingSentence(light,early,'audience',p),readingSentence(light,later,'audience',p));
  assert.match(readingSentence(light,later,'audience',p),/求救/);
});
test('legacy current-occurrence audience updates remain readable without inventing modern design',()=>{
  const p=createSample(),item=p.timelines.audience.placements.find(o=>o.eventId==='e5')!;
  assert.equal(item.audienceDesign,undefined);
  assert.match(readingSentence(p.units.find(u=>u.id==='e5')!,item,'audience',p),/目的仍未知/);
});
test('explicit blank modern cognition is not filled with legacy knowledge',()=>{
  const p=createTimelineDemo(),item=p.timelines.audience.placements[0];item.audienceDesign!.cognition.knows='';item.knowledgeNote='old explanation';
  assert.equal(readingSentence(p.units.find(u=>u.id===item.eventId)!,item,'audience',p),'尚未寫下觀眾在此處知道什麼');
});
test('missing world mapping never invents a character opening state',()=>{
  const p=createTimelineDemo(),item=p.timelines.narrative.placements[0];p.timelines.reality.placements=p.timelines.reality.placements.filter(o=>o.eventId!==item.eventId);
  const c=readingContext(p,item,'narrative');assert.equal(c.worldIndex,-1);assert.equal(c.characters[0].before,undefined);assert.equal(c.characters[0].after,undefined);
});
test('old stories keep every value, ID and approval; no editorial backfill is applied',()=>{
  const p=createSample();delete p.sampleKind;p.units.forEach(u=>delete u.storyLogic);p.title='My original work';
  reviewStage(p,'e1','blueprint');approveStage(p,'e1','blueprint');const raw=JSON.stringify(p);
  assert.deepEqual(readSavedProject({getItem:()=>raw}).project,p);assert.deepEqual(parseProject(raw),p);
});
test('approval history captures causal writing for event and container',()=>{
  const p=createTimelineDemo();reviewStage(p,'e8','blueprint');approveStage(p,'e8','blueprint');
  const a=JSON.parse(p.units.find(u=>u.id==='e8')!.stages.blueprint.approvals[0].snapshot);
  assert.deepEqual(a.unit.storyLogic,p.units.find(u=>u.id==='e8')!.storyLogic);
  reviewStage(p,'s4','blueprint');approveStage(p,'s4','blueprint');
  const b=JSON.parse(p.units.find(u=>u.id==='s4')!.stages.blueprint.approvals[0].snapshot);
  assert.ok(b.descendantUnits.every((u:any)=>u.storyLogic?.cause));
});
test('deleting a referenced event removes only the dangling link and keeps causal prose',()=>{
  const p=createTimelineDemo(),before=clone(p.units.find(u=>u.id==='e9')!.storyLogic);removeUnit(p,'e8');validateProject(p);
  assert.equal(p.units.find(u=>u.id==='e9')!.storyLogic?.causeEventId,undefined);
  assert.equal(p.units.find(u=>u.id==='e9')!.storyLogic?.cause,before?.cause);
});
test('malformed causal references reject import without touching valid data',()=>{
  const p=createTimelineDemo();p.units.find(u=>u.id==='e1')!.storyLogic!.causeEventId='missing';assert.throws(()=>validateProject(p),/causal event/);
});

test('empty-field navigator lists text only, leaving optional references and absent characters alone', async () => {
  const { createBlankProject } = await import('./model');
  const { readingGaps } = await import('./storyReading');
  const p = createBlankProject(), item = p.timelines.reality.placements[0];
  const gaps = readingGaps(p, item, 'reality');
  assert.deepEqual(gaps.map(g => g.field), ['cause', 'action', 'outcome']);
  assert.ok(gaps.every(g => g.category === '事件'));
  p.units.find(u => u.id === item.eventId)!.summary = ' \n ';
  assert.equal(readingGaps(p, item, 'reality').length, 3);
  const full = createTimelineDemo();
  delete full.units.find(u => u.id === 'e8')!.storyLogic!.causeEventId;
  assert.equal(readingGaps(full, full.timelines.reality.placements[7], 'reality').length, 0);
});

test('empty occurrence-specific presentation and explicit blank modern cognition remain visible as empty', async () => {
  const { readingGaps } = await import('./storyReading');
  const p = createTimelineDemo(), first = p.timelines.narrative.placements[0];
  first.note = '';
  assert.ok(p.units.find(u => u.id === first.eventId)!.summary);
  assert.ok(readingGaps(p, first, 'narrative').some(g => g.field === 'note'));
  const a = p.timelines.audience.placements[0];
  a.audienceDesign!.cognition.knows = ' ';
  a.knowledgeNote = 'Do not revive legacy writing';
  assert.ok(readingGaps(p, a, 'audience').some(g => g.field === 'knows'));
});

test('initial motivation edit changes only its source while preserving approvals and undo/redo', async () => {
  const { editReadingCharacter } = await import('./storyReading');
  const p = createTimelineDemo();
  reviewStage(p, 'e8', 'blueprint'); approveStage(p, 'e8', 'blueprint');
  const approval = clone(p.units.find(u => u.id === 'e8')!.stages.blueprint.approvals);
  const store = makeStore(p), before = clone(store.getState().project);
  store.getState().transact(next => editReadingCharacter(next, 'e1', 'lin', 'motivation', '想得到可信的答案', null));
  const after = store.getState().project;
  assert.equal(after.tracks.find(t => t.id === 'lin')!.initial.motivation, '想得到可信的答案');
  assert.deepEqual(after.transitions, before.transitions);
  assert.deepEqual(after.timelines, before.timelines);
  assert.deepEqual(after.tracks.filter(t => t.id !== 'lin'), before.tracks.filter(t => t.id !== 'lin'));
  assert.equal(after.units.find(u => u.id === 'e8')!.stages.blueprint.status, 'draft');
  assert.deepEqual(after.units.find(u => u.id === 'e8')!.stages.blueprint.approvals, approval);
  store.getState().undo(); assert.deepEqual(store.getState().project, before);
  store.getState().redo(); assert.deepEqual(store.getState().project, after);
  assert.deepEqual(parseProject(JSON.stringify(after)), after);
});

test('inherited motivation edits latest prior explicit snapshot even when it is blank', async () => {
  const { editReadingCharacter } = await import('./storyReading');
  const p = createTimelineDemo();
  const item = p.timelines.reality.placements[7];
  const before = readingContext(p, item, 'reality').characters.find(c => c.track.id === 'lin')!;
  assert.ok(before.beforeSourceEventId);
  const sourceId = before.beforeSourceEventId;
  const next = clone(p);
  next.transitions.find(t => t.eventId === sourceId && t.trackId === 'lin')!.after.motivation = '';
  const currentTransition = clone(next.transitions.find(t => t.eventId === item.eventId && t.trackId === 'lin'));
  const initial = clone(next.tracks.find(t => t.id === 'lin')!.initial);
  editReadingCharacter(next, item.eventId, 'lin', 'motivation', '現在才寫下的需要', sourceId);
  assert.equal(next.transitions.find(t => t.eventId === sourceId && t.trackId === 'lin')!.after.motivation, '現在才寫下的需要');
  assert.deepEqual(next.transitions.find(t => t.eventId === item.eventId && t.trackId === 'lin'), currentTransition);
  assert.deepEqual(next.tracks.find(t => t.id === 'lin')!.initial, initial);
});

test('reordered world context resolves motivation source afresh and rejects a stale source', async () => {
  const { editReadingCharacter } = await import('./storyReading');
  const p = createTimelineDemo(), item = p.timelines.reality.placements[7];
  delete p.realityTiming; // This regression specifically covers legacy ordinal semantics.
  const sourceId = readingContext(p, item, 'reality').characters.find(c => c.track.id === 'lin')!.beforeSourceEventId;
  const changed = clone(p);
  changed.timelines.reality.placements = [item, ...changed.timelines.reality.placements.filter(o => o.id !== item.id)];
  const untouched = clone(changed);
  assert.throws(() => editReadingCharacter(changed, item.eventId, 'lin', 'motivation', 'stale draft', sourceId), /來源已變更/);
  assert.deepEqual(changed, untouched);
  editReadingCharacter(changed, item.eventId, 'lin', 'motivation', '開場的需要', null);
  assert.equal(changed.tracks.find(t => t.id === 'lin')!.initial.motivation, '開場的需要');
});

test('unlinked character stays unlinked until an authored interpretation or reaction is saved', async () => {
  const { editReadingCharacter, readingGaps } = await import('./storyReading');
  const p = createTimelineDemo(), item = p.timelines.reality.placements[7];
  p.transitions = p.transitions.filter(t => !(t.eventId === item.eventId && t.trackId === 'lin'));
  const before = readingContext(p, item, 'reality').characters.find(c => c.track.id === 'lin')!.before;
  const count = p.transitions.length;
  editReadingCharacter(p, item.eventId, 'lin', 'reaction', '');
  assert.equal(p.transitions.length, count);
  assert.ok(readingGaps(p, item, 'reality', 'lin').every(g => g.category === '事件'));
  editReadingCharacter(p, item.eventId, 'lin', 'reaction', '決定問清楚');
  const added = p.transitions.find(t => t.eventId === item.eventId && t.trackId === 'lin')!;
  assert.equal(added.reaction, '決定問清楚'); assert.deepEqual(added.after, before);
  assert.equal(p.transitions.length, count + 1); assert.equal(added.interpretation, '');
});

test('character edits refuse missing characters or world mappings without changing the project', async () => {
  const { editReadingCharacter } = await import('./storyReading');
  const p = createTimelineDemo();
  const before = clone(p);
  assert.throws(() => editReadingCharacter(p, 'e8', 'absent-person', 'reaction', 'text'), /找不到/);
  assert.deepEqual(p, before);
  p.timelines.reality.placements = p.timelines.reality.placements.filter(o => o.eventId !== 'e8');
  const unmapped = clone(p);
  assert.throws(() => editReadingCharacter(p, 'e8', 'lin', 'motivation', 'text'), /尚未安排/);
  assert.deepEqual(p, unmapped);
});
