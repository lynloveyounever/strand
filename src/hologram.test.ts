import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDemo } from './sample';
import { createBlankProject } from './model';
import { hologramEntities, resolveHoloSelection, homeCamera, projectPoint } from './hologram';
import { eventMappings, addOccurrence, patchOccurrence } from './temporal';
test('hologram uses independent occurrences and keeps repeated canonical identity',()=>{
 const p=createTimelineDemo(), nodes=hologramEntities(p,87,0);
 for(const b of ['reality','narrative','audience'] as const) assert.equal(nodes.filter(n=>n.basis===b).length,p.timelines[b].placements.length);
 const repeats=nodes.filter(n=>n.basis==='narrative'&&n.unit.canonicalId==='e9');assert.equal(repeats.length,2);assert.notEqual(repeats[0].key,repeats[1].key);
 assert.equal(eventMappings(p,'e9').find(m=>m.basis==='narrative')!.items.length,2);
});
test('compression changes geometry independently from semantic entity resolution without changing project',()=>{
 const p=createTimelineDemo(),before=JSON.stringify(p);
 for(const [zoom,kind] of [[12,'act'],[37,'sequence'],[62,'scene'],[87,'beat']] as const) {
  const expanded=hologramEntities(p,zoom,0), compressed=hologramEntities(p,zoom,1);
  assert.ok(expanded.every(n=>n.unit.kind===kind));assert.deepEqual(expanded.map(n=>n.key),compressed.map(n=>n.key));
  assert.ok(expanded.some(n=>n.point.y!==0));assert.ok(compressed.every(n=>n.point.y===0));
 }
 assert.equal(JSON.stringify(p),before);
});
test('disjoint container runs do not absorb intervening units',()=>{
 const p=createTimelineDemo(); const id=addOccurrence(p,'narrative','e1');patchOccurrence(p,'narrative',id,{containerId:'s1'}); const nodes=hologramEntities(p,12,0).filter(n=>n.basis==='narrative');
 for(const n of nodes) assert.equal(n.end-n.start,n.unit.occurrenceIds.length);
 assert.ok(nodes.length>new Set(nodes.map(n=>n.unit.canonicalId)).size);
});
test('stale selected occurrence resolves safely; missing mapping stays absent',()=>{
 const p=createTimelineDemo();const selected=resolveHoloSelection(p,'narrative','e9','stale');assert.equal(selected?.eventId,'e9');
 p.timelines.reality.placements=p.timelines.reality.placements.filter(o=>o.eventId!=='e9');assert.equal(resolveHoloSelection(p,'reality','e9','stale'),undefined);
});
test('blank project and bounded perspective projection remain finite',()=>{
 const p=createBlankProject();assert.equal(hologramEntities(p,87,0).length,3);
 for(const n of hologramEntities(p,87,0)) {const q=projectPoint(n.point,homeCamera,360,430);assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.scale>0);}
});
test('shared entity fans from canonical location into distinct repeated timeline positions',()=>{
 const p=createTimelineDemo();const expanded=hologramEntities(p,87,0).filter(n=>n.basis==='narrative'&&n.unit.canonicalId==='e9');
 const projected=hologramEntities(p,87,1).filter(n=>n.basis==='narrative'&&n.unit.canonicalId==='e9');
 assert.equal(expanded[0].point.x,expanded[1].point.x);assert.notEqual(projected[0].point.x,projected[1].point.x);
});

test('orbit wraps through full horizontal and vertical turns without old angle stops', async()=>{
 const {orbitCamera,wrapAngle,interpolateAngle}=await import('./hologram');
 const moved=orbitCamera(homeCamera,5,4);
 assert.ok(Math.abs(moved.yaw)>1.15);assert.ok(moved.pitch<-.1);
 assert.deepEqual({zoom:moved.zoom,panX:moved.panX,panY:moved.panY},{zoom:homeCamera.zoom,panX:0,panY:0});
 const returned=orbitCamera(homeCamera,2*Math.PI,-2*Math.PI);
 assert.ok(Math.abs(returned.yaw-homeCamera.yaw)<1e-12);assert.ok(Math.abs(returned.pitch-homeCamera.pitch)<1e-12);
 assert.ok(Math.abs(wrapAngle(5000000))<=Math.PI);
 assert.ok(Math.abs(interpolateAngle(Math.PI-.05,-Math.PI+.05,.5))>3);
 for(let yaw=-Math.PI;yaw<=Math.PI;yaw+=.4) for(let pitch=-Math.PI;pitch<=Math.PI;pitch+=.4) {
  for(const n of hologramEntities(createTimelineDemo(),87,0)) {
   const q=projectPoint(n.point,{...homeCamera,yaw,pitch},390,500);
   assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.scale>0);
  }
 }
});
