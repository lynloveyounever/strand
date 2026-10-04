import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clone, createBlankProject, parseProject, validateProject, removeUnit, approveStage, reviewStage } from './model';
import { createSample, createTimelineDemo } from './sample';
import { addLine, lineRolesAt, resolveScope, setLineRole, updateLine, removeLine, roleWarnings, type LineRole } from './lines';
import { addOccurrence, moveOccurrences, removeOccurrence, patchOccurrence } from './temporal';
import { makeStore, readSavedProject, STORAGE_KEY } from './store';
import { prismProjection } from './hologram';
import { readingViews, validateReadingView, readingCamera } from './views';
const role=(id:string, patch:Partial<LineRole>={}):LineRole=>({id,basis:'narrative',scope:{kind:'whole'},prominence:'main',visibility:'overt',note:'authored',...patch});
function fixture(){const p=createSample(),id=addLine(p,p.units.filter(u=>u.kind==='beat').map(u=>u.id));return {p,id,line:p.narrativeLines![0]};}
test('old JSON and blank projects acquire no inferred line roles',()=>{
  const p=createSample();assert.equal(parseProject(JSON.stringify(p)).narrativeLines,undefined);const old:any=clone(p);old.schemaVersion=1;delete old.timelines;
  assert.equal(validateProject(old).narrativeLines,undefined);assert.equal(createBlankProject().narrativeLines,undefined);
  assert.ok(createTimelineDemo().narrativeLines!.every(l=>l.example));assert.doesNotThrow(()=>validateProject(createTimelineDemo()));
});
test('each dimension inherits separately through whole, act, scene and interval',()=>{
  const {p,id,line}=fixture();setLineRole(p,id,role('whole'));setLineRole(p,id,role('scene',{scope:{kind:'unit',unitId:'s1'},prominence:'sub',visibility:'unspecified'}));setLineRole(p,id,role('range',{scope:{kind:'range',startOccurrenceId:'narrative-e1',endOccurrenceId:'narrative-e1'},prominence:'unspecified',visibility:'covert'}));
  const map=lineRolesAt(p,line,'narrative');assert.equal(map.get(0)!.prominence,'sub');assert.equal(map.get(0)!.visibility,'covert');assert.equal(map.get(1)!.visibility,'overt');assert.equal(map.get(5)!.prominence,'main');assert.equal(lineRolesAt(p,line,'reality').get(0)!.prominence,'unspecified');
});
test('line identity is independent of roles, POV tracks and disclosure',()=>{
  const {p,id,line}=fixture(),before=JSON.stringify({tracks:p.tracks,transitions:p.transitions,timelines:p.timelines});const identity={id:line.id,color:line.color,title:line.title};setLineRole(p,id,role('whole',{visibility:'covert'}));
  assert.deepEqual({id:line.id,color:line.color,title:line.title},identity);assert.equal(JSON.stringify({tracks:p.tracks,transitions:p.transitions,timelines:p.timelines}),before);
});
test('repeat occurrences of one event can resolve differently without another canonical event',()=>{
  const {p,id,line}=fixture(),count=p.units.length;const repeat=addOccurrence(p,'narrative','e1');setLineRole(p,id,role('repeat',{scope:{kind:'range',startOccurrenceId:repeat,endOccurrenceId:repeat},visibility:'covert'}));const map=lineRolesAt(p,line,'narrative');
  assert.equal(map.get(0)!.visibility,'unspecified');assert.equal(map.get(p.timelines.narrative.placements.length-1)!.visibility,'covert');assert.equal(p.units.length,count);
});
test('unit scopes follow occurrence containers and ancestor membership',()=>{
  const {p,id,line}=fixture(),repeat=addOccurrence(p,'narrative','e1');patchOccurrence(p,'narrative',repeat,{containerId:'s5'});setLineRole(p,id,role('scene',{scope:{kind:'unit',unitId:'s1'}}));
  const map=lineRolesAt(p,line,'narrative');assert.equal(map.get(0)!.prominence,'main');assert.equal(map.get(16)!.prominence,'unspecified');
});
test('range anchors survive reorder, reverse inclusively and retain their identifiers',()=>{
  const {p,id,line}=fixture(),r=role('range',{scope:{kind:'range',startOccurrenceId:'narrative-e2',endOccurrenceId:'narrative-e4'}});setLineRole(p,id,r);assert.deepEqual(resolveScope(p,r).indices,[1,2,3]);moveOccurrences(p,'narrative',['narrative-e2'],'narrative-e6');
  assert.deepEqual(resolveScope(p,r).indices,[2,3,4,5]);assert.deepEqual(line.roles[0].scope,r.scope);assert.equal(lineRolesAt(p,line,'narrative').get(5)!.prominence,'main');
});
test('deleting a boundary suspends its entire role; default remains and undo restores exact scope',()=>{
  const {p,id}=fixture();setLineRole(p,id,role('whole',{prominence:'sub'}));setLineRole(p,id,role('range',{scope:{kind:'range',startOccurrenceId:'narrative-e2',endOccurrenceId:'narrative-e4'}}));const store=makeStore(p);store.getState().transact(next=>removeOccurrence(next,'narrative','narrative-e2'));let next=store.getState().project,line=next.narrativeLines![0];
  assert.equal(roleWarnings(next,line).length,1);assert.ok([...lineRolesAt(next,line,'narrative').values()].every(r=>r.prominence==='sub'));assert.equal(line.roles.length,2);store.getState().undo();next=store.getState().project;assert.equal(roleWarnings(next,next.narrativeLines![0]).length,0);store.getState().redo();assert.equal(roleWarnings(store.getState().project,store.getState().project.narrativeLines![0]).length,1);
});
test('deleting a scoped unit preserves a repairable assignment and prunes only deleted members',()=>{
  const {p,id}=fixture();setLineRole(p,id,role('scene',{scope:{kind:'unit',unitId:'s1'}}));const store=makeStore(p);store.getState().transact(next=>removeUnit(next,'s1'));const next=store.getState().project,line=next.narrativeLines![0];assert.equal(line.roles[0].scope.kind,'unit');assert.equal(roleWarnings(next,line).length,1);assert.equal(line.eventIds.includes('e1'),false);assert.doesNotThrow(()=>validateProject(next));
});
test('same-priority conflicts are explicit per dimension and independent of array order',()=>{
  const {p,id,line}=fixture();setLineRole(p,id,role('a'));setLineRole(p,id,role('b',{visibility:'covert'}));const a=lineRolesAt(p,line,'narrative').get(0)!;assert.equal(a.visibility,'conflict');assert.equal(a.prominence,'main');line.roles.reverse();assert.equal(lineRolesAt(p,line,'narrative').get(0)!.visibility,'conflict');assert.ok(roleWarnings(p,line).some(w=>w.id==='conflict-narrative'));
});
test('reorder can create overlap conflicts without blocking timeline editing',()=>{
  const {p,id}=fixture();setLineRole(p,id,role('a',{scope:{kind:'range',startOccurrenceId:'narrative-e1',endOccurrenceId:'narrative-e2'}}));setLineRole(p,id,role('b',{scope:{kind:'range',startOccurrenceId:'narrative-e4',endOccurrenceId:'narrative-e5'},visibility:'covert'}));const store=makeStore(p);store.getState().transact(next=>moveOccurrences(next,'narrative',['narrative-e2'],'narrative-e5'));assert.equal(store.getState().notice,'');assert.ok(roleWarnings(store.getState().project,store.getState().project.narrativeLines![0]).some(w=>w.id==='conflict-narrative'));
});
test('scope may be anchored outside membership; removing a member does not rewrite range',()=>{
  const {p,id,line}=fixture();const r=role('range',{scope:{kind:'range',startOccurrenceId:'narrative-e1',endOccurrenceId:'narrative-e4'}});setLineRole(p,id,r);updateLine(p,id,{eventIds:['e2']});assert.equal(resolveScope(p,r).indices.length,4);assert.equal(lineRolesAt(p,line,'narrative').size,1);assert.equal(roleWarnings(p,line).length,0);
});
test('JSON roundtrip, persistence and import undo preserve roles and prior approval snapshots',()=>{
  const {p,id}=fixture();reviewStage(p,'e1','blueprint');approveStage(p,'e1','blueprint');const history=p.units.find(u=>u.id==='e1')!.stages.blueprint.approvals[0].snapshot;setLineRole(p,id,role('whole'));assert.equal(p.units.find(u=>u.id==='e1')!.stages.blueprint.status,'draft');assert.equal(p.units.find(u=>u.id==='e1')!.stages.blueprint.approvals[0].snapshot,history);
  const raw=JSON.stringify(p);assert.deepEqual(parseProject(raw).narrativeLines,p.narrativeLines);assert.deepEqual(readSavedProject({getItem:key=>key===STORAGE_KEY?raw:null}).project.narrativeLines,p.narrativeLines);const store=makeStore(createBlankProject());store.getState().importProject(parseProject(raw));assert.equal(store.getState().lineId,id);store.getState().undo();assert.equal(store.getState().project.narrativeLines,undefined);store.getState().redo();assert.equal(store.getState().project.narrativeLines![0].id,id);
});
test('new approvals include authored line context and deleting a line preserves story events',()=>{
  const {p,id}=fixture();setLineRole(p,id,role('whole'));reviewStage(p,'e1','blueprint');approveStage(p,'e1','blueprint');assert.equal(JSON.parse(p.units.find(u=>u.id==='e1')!.stages.blueprint.approvals[0].snapshot).narrativeLines[0].roles[0].id,'whole');const count=p.units.length;removeLine(p,id);assert.equal(p.units.length,count);assert.equal(p.narrativeLines!.length,0);
});
test('validation rejects malformed roles, unknown members and cross-basis endpoint substitution',()=>{
  const {p,id}=fixture();setLineRole(p,id,role('r',{scope:{kind:'range',startOccurrenceId:'reality-e1',endOccurrenceId:'reality-e2'}}));assert.throws(()=>validateProject(p));p.narrativeLines![0].roles=[];p.narrativeLines![0].eventIds=['missing'];assert.throws(()=>validateProject(p));p.narrativeLines![0].eventIds=['e1'];p.narrativeLines![0].roles=[role('x')];(p.narrativeLines![0].roles[0] as any).visibility='confirmed';assert.throws(()=>validateProject(p));
});
test('prism maps one stable canonical entity to all and only its repeated occurrences',()=>{
  const p=createTimelineDemo(),map=prismProjection(p,'e9')!;assert.equal(map.targets.filter(t=>t.basis==='narrative').length,2);assert.equal(map.targets.filter(t=>t.basis==='audience').length,0);const source=clone(map.source);moveOccurrences(p,'narrative',['narrative-opening'],'narrative-e16');assert.deepEqual(prismProjection(p,'e9')!.source,source);assert.equal(new Set(map.targets.map(t=>t.item.id)).size,map.targets.length);assert.equal(prismProjection(p,'missing'),null);
});
test('three reading views share validated dimensions, keep finite cameras and reject invented metrics',()=>{
  readingViews.forEach(view=>{assert.deepEqual(validateReadingView(view),view);const camera=readingCamera(view,390,500,()=>({x:195,y:250}));assert.ok(Object.values(camera).every(Number.isFinite));});assert.throws(()=>validateReadingView({...readingViews[0],dimensions:{...readingViews[0].dimensions,vertical:'inferred-truth'}}));assert.throws(()=>validateReadingView({...readingViews[0],camera:{yaw:NaN,pitch:.5,zoom:1}}));
});
test('reading view validation requires all three finite camera components',()=>{
  assert.throws(()=>validateReadingView({...readingViews[0],camera:{}}));assert.throws(()=>validateReadingView({...readingViews[0],camera:{pitch:.5,zoom:1}}));
});
