import { kindAt, orderedBeats, ranges, type Project, type Kind } from './model';
import { axisView, bases, type TimeBasis, type ViewUnit } from './temporal';
export type Vec3 = { x: number; y: number; z: number };
export type Camera = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
export const homeCamera: Camera = { yaw: -0.22, pitch: 0.55, zoom: 1, panX: 0, panY: 0 };
export const layerColors: Record<TimeBasis, string> = { reality: '#9bd8bd', narrative: '#a4bcff', audience: '#edc585' };
const heights: Record<Kind, number> = { story: -160, act: -125, sequence: -88, scene: -50, beat: -20 };
export const mix = (a: number, b: number, t: number) => a + (b-a)*t;
/** Keep angles numerically bounded without stopping the orbit at an edge. */
export function wrapAngle(angle: number) {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}
export function orbitCamera(camera: Camera, yawDelta: number, pitchDelta: number): Camera {
  return { ...camera, yaw: wrapAngle(camera.yaw + yawDelta), pitch: wrapAngle(camera.pitch + pitchDelta) };
}
export function interpolateAngle(from: number, to: number, t: number) {
  return wrapAngle(from + wrapAngle(to - from) * t);
}

export function entityPoint(basis: TimeBasis, index: number, length: number, kind: Kind, compression: number): Vec3 {
  return { x: -360 + 720 * index / Math.max(1, length), y: heights[kind] * (1-compression), z: (bases.indexOf(basis)-1)*250 };
}
export function projectPoint(v: Vec3, camera: Camera, width: number, height: number) {
  const x = v.x * Math.cos(camera.yaw) + v.z * Math.sin(camera.yaw);
  const z = -v.x * Math.sin(camera.yaw) + v.z * Math.cos(camera.yaw);
  const y = v.y * Math.cos(camera.pitch) - z * Math.sin(camera.pitch);
  const depth = v.y * Math.sin(camera.pitch) + z * Math.cos(camera.pitch);
  const perspective = 1300 / (1300 + depth);
  const scale = Math.min(width / 1000, height / 600) * camera.zoom * perspective;
  return { x: width/2 + x*scale + camera.panX, y: height/2 + y*scale + camera.panY, depth, scale };
}
export type HoloEntity = { key: string; basis: TimeBasis; unit: ViewUnit; start: number; end: number; length: number; point: Vec3 };
export function hologramEntities(p: Project, zoom: number, compression: number): HoloEntity[] {
  const canonicalRanges = ranges(p), canonicalLength = orderedBeats(p).length;
  return bases.flatMap(basis => {
    const axis = axisView(p,basis), length = p.timelines[basis].placements.length;
    return axis.units.filter(unit=>unit.kind===kindAt(zoom)).map(unit=>{
      const r = axis.ranges.get(unit.id)!;
      const source = canonicalRanges.get(unit.canonicalId)!;
      const sourceX = -360 + 720 * (source.start+source.end)/2 / Math.max(1,canonicalLength);
      const targetX = -360 + 720 * (r.start+r.end)/2 / Math.max(1,length);
      return { key: basis+'|'+unit.id, basis, unit: unit as ViewUnit, ...r, length, point: { ...entityPoint(basis,(r.start+r.end)/2,length,unit.kind,compression), x: mix(sourceX,targetX,compression), y: unit.kind==='beat' ? -(30 + (source.start % 3)*18)*(1-compression) : heights[unit.kind]*(1-compression) } };
    });
  });
}
export function resolveHoloSelection(p: Project, basis: TimeBasis, selectedId: string, occurrenceId: string) {
  const list = p.timelines[basis].placements;
  const exact = list.find(item=>item.id===occurrenceId && item.eventId===selectedId);
  return exact ?? list.find(item=>item.eventId===selectedId);
}

// Projection is identity correspondence, never a causal edge. Repeats retain occurrence IDs.
export function prismProjection(p: Project, selectedId: string) {
  const unit=p.units.find(u=>u.id===selectedId), range=ranges(p).get(selectedId);
  if(!unit||!range)return null;
  const canonical=orderedBeats(p), eventIds=new Set(canonical.slice(range.start,range.end).map(u=>u.id));
  return {
    source: {x:-360+720*(range.start+range.end)/2/Math.max(1,canonical.length),y:-205,z:0} as Vec3,
    targets:bases.flatMap(basis=>p.timelines[basis].placements.flatMap((item,index)=>eventIds.has(item.eventId)?[{basis,item,index,point:{...entityPoint(basis,index+.5,p.timelines[basis].placements.length,'beat',1),y:0}}]:[])),
  };
}
