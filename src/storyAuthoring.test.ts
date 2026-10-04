import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStoryUnit, addStoryCharacter, editCharacterOpening, editStoryContext, editCraft, editStoryLogic, editChoiceTheme, editCharacterEffect, editAudienceUnderstanding, readableBlueprint, blueprintEntries } from './storyAuthoring';
import { approveStage, clone, createBlankProject, editUnit, parseProject, reviewStage, rebaseStage, moveSibling, removeUnit, validateProject } from './model';
import { createSample } from './sample';
import { editReadingCharacter } from './storyReading';
import { addOccurrence } from './temporal';
import { makeStore, readSavedProject, STORAGE_KEY } from './store';

const blank = () => createBlankProject();
test('one blank event, no cast and no optional framework is a valid reopenable starting point', () => {
 const p = blank(); assert.equal(p.units.length,5); assert.equal(p.tracks.length,0);
 editUnit(p,'new-beat',{summary:'她發現門外多了一封信'});
 const reopened = readSavedProject({ getItem: key => key === STORAGE_KEY ? JSON.stringify(p) : null }).project;
 assert.deepEqual(reopened,p); assert.equal(reopened.themeQuestion,undefined); assert.equal(reopened.units[4].craft,undefined);
 assert.match(readableBlueprint(p),/她發現門外多了一封信/); assert.doesNotMatch(readableBlueprint(p),/對抗／阻力/);
});
test('idea, optional scene craft and cause/outcome share the old fields and round-trip through undo and JSON', () => {
 const store = makeStore(blank());
 store.getState().transact(p => { editStoryContext(p,{title:'信',premise:'一封不該出現的信',themeQuestion:'保護是否等於控制？'}); editUnit(p,'new-scene',{intent:'找到寄件人'}); editCraft(p,'new-scene',{opposition:'大樓管理員阻止她調閱',turn:'她認出自己的字跡'}); editStoryLogic(p,'new-scene',{outcome:'她決定追問家人'}); editStoryLogic(p,'new-beat',{cause:'信被送錯門牌',outcome:'她開始調查'}); });
 const p = clone(store.getState().project); assert.deepEqual(parseProject(JSON.stringify(p)),p);
 store.getState().undo(); assert.equal(store.getState().project.themeQuestion,undefined); store.getState().redo(); assert.deepEqual(store.getState().project,p);
 assert.equal(p.units[0].title,p.title); const text = readableBlueprint(p); for(const fragment of ['找到寄件人','大樓管理員阻止她調閱','她認出自己的字跡','她決定追問家人','她開始調查']) assert.ok(text.includes(fragment));
});
test('new events enter their scene without normalizing independent existing orders or repeated occurrences', () => {
 const p = createSample(); const scene = p.units.find(u=>u.kind==='scene')!;
 addOccurrence(p,'narrative','e1'); p.timelines.narrative.placements.reverse();
 const old = Object.fromEntries(Object.entries(p.timelines).map(([basis,t])=>[basis,t.placements.map(o=>o.id)]));
 const id = addStoryUnit(p,scene.id,'beat'); validateProject(p);
 for(const basis of ['reality','narrative','audience'] as const) assert.deepEqual(p.timelines[basis].placements.filter(o=>o.eventId!==id).map(o=>o.id),old[basis]);
 assert.equal(p.units.find(u=>u.id===id)?.parentId,scene.id);
 const newEvent = addStoryUnit(p,scene.id,'scene'); assert.equal(p.units.find(u=>u.id===p.units.find(x=>x.id===newEvent)?.parentId)?.kind,'scene'); validateProject(p);
});
test('structure reorder changes presentation only; delete and undo restore causal links and new fields', () => {
 const store = makeStore(blank()); let second='';
 store.getState().transact(p=>{second=addStoryUnit(p,'new-scene','beat'); editStoryLogic(p,second,{cause:'承接前次拒絕',causeEventId:'new-beat'});});
 const world=clone(store.getState().project.timelines.reality); const audience=clone(store.getState().project.timelines.audience);
 store.getState().transact(p=>moveSibling(p,second,-1)); assert.deepEqual(store.getState().project.timelines.reality,world); assert.deepEqual(store.getState().project.timelines.audience,audience);
 store.getState().transact(p=>removeUnit(p,'new-beat')); assert.equal(store.getState().project.units.find(u=>u.id===second)?.storyLogic?.causeEventId,undefined); assert.equal(store.getState().project.units.find(u=>u.id===second)?.storyLogic?.cause,'承接前次拒絕');
 store.getState().undo(); assert.equal(store.getState().project.units.find(u=>u.id===second)?.storyLogic?.causeEventId,'new-beat');
});
test('character choices and theme preserve every other authored state; theme alone creates no fictitious transition', () => {
 const p=blank(), id=addStoryCharacter(p,'她'); editCharacterOpening(p,id,{goal:'查明真相',knowledge:'不知道寄件人'});
 assert.throws(()=>editChoiceTheme(p,'new-beat',id,'信任與控制'),/先寫下/); assert.equal(p.transitions.length,0);
 editReadingCharacter(p,'new-beat',id,'reaction','她隱瞞這封信，想保護家人'); const before=clone(p.transitions[0].after);
 editChoiceTheme(p,'new-beat',id,'她的保護使家人失去知情權'); assert.deepEqual(p.transitions[0].after,before);
 editCharacterEffect(p,'new-beat',id,'state','信任開始動搖'); assert.equal(p.transitions[0].after.goal,'查明真相'); assert.equal(p.transitions[0].after.knowledge,'不知道寄件人'); assert.equal(p.transitions[0].themeLink,'她的保護使家人失去知情權');
 assert.match(readableBlueprint(p),/她隱瞞這封信/); validateProject(p);
});
test('unmapped world states cannot be invented through effect edits', () => {
 const p=blank(), id=addStoryCharacter(p,'她'); const second=addStoryUnit(p,'new-scene','beat'); p.timelines.reality.placements=p.timelines.reality.placements.filter(o=>o.eventId!==second);
 assert.throws(()=>editCharacterEffect(p,second,id,'state','安心'),/前項未定/); assert.equal(p.transitions.length,0);
});
test('audience effect edits target one repeated occurrence, preserve legacy content and respect modern explicit blanks', () => {
 const p=blank(); const first=p.timelines.audience.placements[0]; first.knowledgeNote='舊的觀眾知識'; const other=addOccurrence(p,'audience','new-beat');
 editAudienceUnderstanding(p,first.id,'believes','她可能是寄件人'); assert.equal(first.audienceDesign?.cognition.knows,'舊的觀眾知識');
 editAudienceUnderstanding(p,first.id,'knows',''); assert.equal(first.audienceDesign?.cognition.knows,'');
 editAudienceUnderstanding(p,other,'knows','此時才看見署名'); assert.equal(first.audienceDesign?.cognition.knows,''); assert.equal(p.timelines.audience.placements[1].audienceDesign?.cognition.knows,'此時才看見署名'); validateProject(p);
});
test('story and scene approval snapshots freeze complete blueprint context while old snapshots stay immutable', () => {
 const p=blank(), id=addStoryCharacter(p,'她'); editStoryContext(p,{premise:'一封信',themeQuestion:'信任？'}); editUnit(p,'new-scene',{intent:'打開信'}); editCraft(p,'new-scene',{turn:'寄件人是自己'}); editReadingCharacter(p,'new-beat',id,'reaction','她隱瞞署名'); editChoiceTheme(p,'new-beat',id,'她選擇隱瞞');
 reviewStage(p,'new-story','blueprint'); approveStage(p,'new-story','blueprint'); const approved=p.units[0].stages.blueprint.approvals[0]; const frozen=approved.snapshot;
 const captured=JSON.parse(frozen); assert.equal(captured.storyContext.themeQuestion,'信任？'); assert.equal(captured.perspectives[0].name,'她'); assert.deepEqual(captured.perspectives[0].initial,p.tracks[0].initial); assert.equal(captured.descendantUnits.find((u:any)=>u.id==='new-scene').intent,'打開信'); assert.equal(captured.descendantUnits.find((u:any)=>u.id==='new-scene').craft.turn,'寄件人是自己'); assert.equal(captured.transitions[0].themeLink,'她選擇隱瞞');
 rebaseStage(p,'new-beat','director'); reviewStage(p,'new-beat','director'); approveStage(p,'new-beat','director'); const legacy=JSON.stringify(p.units[4].stages.director.approvals);
 editStoryContext(p,{themeQuestion:'控制？'}); assert.equal(approved.snapshot,frozen); assert.equal(JSON.stringify(p.units[4].stages.director.approvals),legacy); assert.notEqual(p.units[4].stages.director.blueprintRevision,p.units[4].stages.blueprint.revision);
});
test('v1/v2 migration keeps untouched legacy notes, history and absent optional fields', () => {
 const p=createSample(); const expected=JSON.stringify(p.units.map(u=>u.stages)); const legacy:any=clone(p); legacy.schemaVersion=1; delete legacy.timelines;
 const migrated=parseProject(JSON.stringify(legacy)); assert.equal(JSON.stringify(migrated.units.map(u=>u.stages)),expected); assert.equal(migrated.themeQuestion,undefined);
 assert.deepEqual(parseProject(JSON.stringify(p)),p);
});
test('all new import surfaces reject non-text, oversized values and invalid craft atomically', () => {
 const store=makeStore(blank()); const before=clone(store.getState().project);
 for(const mutate of [(p:any)=>p.themeQuestion=4,(p:any)=>p.units[4].craft={opposition:'',turn:[]},(p:any)=>p.themeQuestion='x'.repeat(20001)]) {const p:any=blank();mutate(p);assert.throws(()=>validateProject(p));}
 store.getState().transact(p=>editCraft(p,'new-scene',{turn:'x'.repeat(20001)})); assert.deepEqual(store.getState().project,before);
 const p=blank(), id=addStoryCharacter(p,'她'); editReadingCharacter(p,'new-beat',id,'reaction','停下'); (p.transitions[0] as any).themeLink=4; assert.throws(()=>validateProject(p)); p.transitions[0].themeLink='';p.timelines.audience.placements[0].updates=[{trackId:id,interpretation:'',reaction:'',after:p.tracks[0].initial,themeLink:4 as any}];assert.throws(()=>validateProject(p));
});
test('readable blueprint distinguishes structure from telling order and never synthesizes dialogue or motivations', () => {
 const p=blank(); editUnit(p,'new-beat',{summary:'她把信藏進抽屜'}); const id=addStoryUnit(p,'new-scene','beat'); editUnit(p,id,{summary:'家人發現她隱瞞'}); addOccurrence(p,'narrative','new-beat');
 assert.equal(blueprintEntries(p).length,2); assert.equal(blueprintEntries(p,'narrative').length,3);
 const text=readableBlueprint(p,'narrative'); assert.match(text,/呈現順序（重複呈現會保留）/); assert.equal(text.split('她把信藏進抽屜').length-1,2); assert.doesNotMatch(text,/推動他的需要/);
});
