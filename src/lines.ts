import { descendants, kinds, uid, updateBlueprint, type Project } from './model';
import { bases, type TimeBasis } from './temporal';

export type LineScope = { kind: 'whole' } | { kind: 'unit'; unitId: string } | { kind: 'range'; startOccurrenceId: string; endOccurrenceId: string };
export type Prominence = 'unspecified' | 'main' | 'sub';
export type Visibility = 'unspecified' | 'overt' | 'covert';
export type LineRole = { id: string; basis: TimeBasis; scope: LineScope; prominence: Prominence; visibility: Visibility; note: string };
export type NarrativeLine = { id: string; title: string; color: string; eventIds: string[]; roles: LineRole[]; example?: true };
export type ResolvedRole = { prominence: Prominence | 'conflict'; visibility: Visibility | 'conflict'; roleIds: string[] };
export const prominenceLabels = { unspecified: '未指定', main: '主線', sub: '副線', conflict: '主副衝突' };
export const visibilityLabels = { unspecified: '未指定', overt: '明線', covert: '暗線', conflict: '明暗衝突' };
export const roleLabel = (r: Pick<ResolvedRole,'prominence'|'visibility'>) => `${prominenceLabels[r.prominence]} · ${visibilityLabels[r.visibility]}`;
export const lineStroke = (r: ResolvedRole) => ({ width: r.prominence === 'main' ? 5 : r.prominence === 'sub' ? 2.5 : 1.5, dash: r.visibility === 'covert' ? '7 5' : r.visibility === 'overt' ? undefined : '1 4' });
export function lineEvents(p: Project, unitId: string) {
  const unit = p.units.find(u => u.id === unitId);
  return unit?.kind === 'beat' ? [unit.id] : unit ? descendants(p,unit.id).filter(u=>u.kind==='beat').map(u=>u.id) : [];
}
function ancestry(p: Project, id: string): string[] {
  const result: string[] = [];
  let unit = p.units.find(u=>u.id===id);
  while(unit) { result.push(unit.id); unit=p.units.find(u=>u.id===unit!.parentId); }
  return result;
}
export function resolveScope(p: Project, role: LineRole): { indices: number[]; priority: number; warning?: string } {
  const list = p.timelines[role.basis].placements;
  const scope = role.scope;
  if(scope.kind==='whole') return {indices:list.map((_,i)=>i),priority:0};
  if(scope.kind==='unit') {
    const unit=p.units.find(u=>u.id===scope.unitId);
    if(!unit) return {indices:[],priority:0,warning:'範圍單元已刪除；請重新選擇'};
    return {indices:list.flatMap((o,i)=> (unit.kind==='beat' ? o.eventId===unit.id : ancestry(p,o.containerId).includes(unit.id)) ? [i]:[]),priority:kinds.indexOf(unit.kind)+1};
  }
  const start=list.findIndex(o=>o.id===scope.startOccurrenceId),end=list.findIndex(o=>o.id===scope.endOccurrenceId);
  if(start<0||end<0) return {indices:[],priority:10,warning:'範圍端點已刪除或不在此時間軸；設定暫停，請修復'};
  return {indices:list.flatMap((_,i)=>i>=Math.min(start,end)&&i<=Math.max(start,end)?[i]:[]),priority:10};
}
export function lineRolesAt(p: Project, line: NarrativeLine, basis: TimeBasis): Map<number,ResolvedRole> {
  const roles=line.roles.filter(r=>r.basis===basis).map(r=>{const scope=resolveScope(p,r);return {...scope,indices:new Set(scope.indices),role:r};});
  const map=new Map<number,ResolvedRole>();
  p.timelines[basis].placements.forEach((o,i)=>{
    if(!line.eventIds.includes(o.eventId))return;
    const matching=roles.filter(r=>r.indices.has(i));
    const used=new Set<string>();
    const dimension=<K extends 'prominence'|'visibility'>(key:K): ResolvedRole[K] => {
      const claims=matching.filter(r=>r.role[key]!=='unspecified');
      const priority=Math.max(-1,...claims.map(r=>r.priority));
      const winners=claims.filter(r=>r.priority===priority);
      winners.forEach(r=>used.add(r.role.id));
      const values=new Set(winners.map(r=>r.role[key]));
      return (values.size>1?'conflict':values.values().next().value??'unspecified') as ResolvedRole[K];
    };
    const prominence=dimension('prominence'),visibility=dimension('visibility');
    map.set(i,{prominence,visibility,roleIds:[...used]});
  });
  return map;
}
export function roleWarnings(p: Project,line:NarrativeLine) {
  const warnings=line.roles.flatMap(r=>{const warning=resolveScope(p,r).warning;return warning?[{id:r.id,message:warning}]:[];});
  for(const basis of bases) if([...lineRolesAt(p,line,basis).values()].some(r=>r.prominence==='conflict'||r.visibility==='conflict')) warnings.push({id:'conflict-'+basis,message:`${basis} 有同優先範圍的角色衝突；請調整範圍或刪除重複設定`});
  return warnings;
}
function changed(p:Project) { updateBlueprint(p,p.units.find(u=>u.kind==='story')!.id); }
export function addLine(p:Project,eventIds:string[] = []) {
  const line:NarrativeLine={id:uid(),title:'未命名敘事線',color:'#a4bcff',eventIds:[...new Set(eventIds)],roles:[]};
  (p.narrativeLines??=[]).push(line);changed(p);return line.id;
}
export function updateLine(p:Project,id:string,patch:Partial<Pick<NarrativeLine,'title'|'color'|'eventIds'>>) {
  const line=p.narrativeLines?.find(l=>l.id===id);if(!line)throw new Error('敘事線不存在');
  Object.assign(line,patch);changed(p);
}
export function removeLine(p:Project,id:string) {p.narrativeLines=p.narrativeLines?.filter(l=>l.id!==id);changed(p);}
export function setLineRole(p:Project,lineId:string,role:LineRole) {
  const line=p.narrativeLines?.find(l=>l.id===lineId);if(!line)throw new Error('敘事線不存在');
  const index=line.roles.findIndex(r=>r.id===role.id);if(index<0)line.roles.push(role);else line.roles[index]=role;changed(p);
}
export function removeLineRole(p:Project,lineId:string,roleId:string) {const line=p.narrativeLines?.find(l=>l.id===lineId);if(line){line.roles=line.roles.filter(r=>r.id!==roleId);changed(p);}}
export function reconcileLines(p:Project) {
  const ids=new Set(p.units.filter(u=>u.kind==='beat').map(u=>u.id));
  for(const line of p.narrativeLines??[]) line.eventIds=line.eventIds.filter(id=>ids.has(id));
  // Keep broken scopes for explicit repair and undo. Never guess a replacement endpoint.
}
export function validateLines(p:Project) {
  if(p.narrativeLines===undefined)return;
  const fail=()=>{throw new Error('Invalid project: narrative lines or scoped roles');};
  const text=(x:unknown,max=20000)=>typeof x==='string'&&x.length<=max;
  const id=(x:unknown)=>text(x,100)&&/^[a-zA-Z0-9_-]+$/.test(x as string)&&!['__proto__','constructor','prototype'].includes(x as string);
  if(!Array.isArray(p.narrativeLines)||p.narrativeLines.length>24)fail();
  const ids=new Set<string>(),roleIds=new Set<string>(),events=new Set(p.units.filter(u=>u.kind==='beat').map(u=>u.id));
  for(const line of p.narrativeLines) {
    if(!line||!id(line.id)||ids.has(line.id)||!text(line.title,300)||!/^#[0-9a-fA-F]{6}$/.test(line.color)||!Array.isArray(line.eventIds)||line.eventIds.length>1000||new Set(line.eventIds).size!==line.eventIds.length||line.eventIds.some(e=>!events.has(e))||!Array.isArray(line.roles)||line.roles.length>100||(line.example!==undefined&&line.example!==true))fail();
    ids.add(line.id);
    for(const role of line.roles) {
      if(!role||!id(role.id)||roleIds.has(role.id)||!bases.includes(role.basis)||!['unspecified','main','sub'].includes(role.prominence)||!['unspecified','overt','covert'].includes(role.visibility)||!text(role.note)||!role.scope||Array.isArray(role.scope))fail();
      roleIds.add(role.id);const scope=role.scope;
      if(scope.kind==='unit'){if(!id(scope.unitId))fail();}
      else if(scope.kind==='range'){if(!id(scope.startOccurrenceId)||!id(scope.endOccurrenceId))fail();
        for(const endpoint of [scope.startOccurrenceId,scope.endOccurrenceId]) if(bases.some(b=>b!==role.basis&&p.timelines[b].placements.some(o=>o.id===endpoint)))fail();
      } else if(scope.kind!=='whole')fail();
    }
  }
}
