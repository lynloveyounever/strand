import { AtlasIcon } from "./AtlasIcon";
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { editor, useEditor } from './store';
import { basisLabels, type TimeBasis } from './temporal';
import { uid } from './model';
import { resolveHoloSelection } from './hologram';
import { addLine, lineEvents, lineRolesAt, lineStroke, prominenceLabels, removeLine, removeLineRole, resolveScope, roleLabel, roleWarnings, setLineRole, updateLine, visibilityLabels, type LineRole, type LineScope, type NarrativeLine, type Prominence, type Visibility } from './lines';

export function openLine(id?:string) { editor.setState({...(id?{lineId:id}:{}),panel:'lines',inspectorOpen:true,outlineOpen:false}); }
export function LineShelf() {
  const project=useEditor(s=>s.project),lineId=useEditor(s=>s.lineId),lines=project.narrativeLines??[];
  return <div className="line-shelf" aria-label="Narrative lines"><button onClick={()=>openLine()} aria-label="Edit narrative lines" title="管理故事線的名稱與區段角色"><AtlasIcon name="sequence"/> <span>管理故事線</span></button>{lines.map(line=><button key={line.id} aria-pressed={line.id===(lines.some(l=>l.id===lineId)?lineId:lines[0]?.id)} onClick={()=>openLine(line.id)} style={{'--line-color':line.color} as CSSProperties}><i/>{line.title}</button>)}</div>;
}
export function LineLegend() { return <span className="line-legend" aria-label="線條樣式說明"><span title="主線：較粗的線條"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" strokeWidth="3"/></svg>主線</span><span title="副線：較細的線條"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" strokeWidth="1"/></svg>副線</span><span title="明線：實線呈現"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" strokeWidth="1.5"/></svg>明線</span><span title="暗線：虛線呈現"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4"/></svg>暗線</span><span title="角色尚未指定"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 4"/></svg>未設定</span><span title="此處改變主副或明暗角色"><svg viewBox="0 0 30 10" aria-hidden="true"><path d="m15 1 4 4-4 4-4-4Z" stroke="currentColor" fill="none"/></svg>角色轉換</span></span>; }
export function LineStrip() {
  const p=useEditor(s=>s.project),basis=useEditor(s=>s.basis),length=p.timelines[basis].placements.length;
  return <div className="line-strip"><LineShelf/>{!!p.narrativeLines?.length&&<><LineLegend/>{p.narrativeLines.map(line=><button className="line-strip-row" key={line.id} onClick={()=>openLine(line.id)} aria-label={`Edit line ${line.title}`}><span style={{color:line.color}}>{line.title}</span><svg viewBox="0 0 600 22" preserveAspectRatio="none" aria-hidden="true">{[...lineRolesAt(p,line,basis)].map(([i,role])=>{const style=lineStroke(role);return <path key={i} d={`M${600*i/length+2} 11H${600*(i+1)/length-2}`} stroke={line.color} strokeWidth={style.width} strokeDasharray={style.dash}/>;})}</svg></button>)}</>}</div>;
}
const scopeTitle=(p:ReturnType<typeof editor.getState>['project'],role:LineRole)=>role.scope.kind==='whole'?'整條線':role.scope.kind==='unit'?(p.units.find(u=>u.id===(role.scope as {unitId:string}).unitId)?.title??'已刪除單元'):(()=>{const scope=role.scope as Extract<LineScope,{kind:'range'}>,list=p.timelines[role.basis].placements,a=list.findIndex(o=>o.id===scope.startOccurrenceId),b=list.findIndex(o=>o.id===scope.endOccurrenceId);return a<0||b<0?'待修復區段':`#${Math.min(a,b)+1}–#${Math.max(a,b)+1}`;})();

function RoleEditor({line,role,onDone}:{line:NarrativeLine;role?:LineRole;onDone:()=>void}) {
  const p=useEditor(s=>s.project),currentBasis=useEditor(s=>s.basis);
  const [basis,setBasis]=useState<TimeBasis>(role?.basis??currentBasis),[scope,setScope]=useState<LineScope>(role?.scope??{kind:'whole'}),[prominence,setProminence]=useState<Prominence>(role?.prominence??'unspecified'),[visibility,setVisibility]=useState<Visibility>(role?.visibility??'unspecified'),[note,setNote]=useState(role?.note??''),[pick,setPick]=useState<'start'|'end'|null>(null);
  const list=p.timelines[basis].placements;
  const scopeOptions=p.units.filter(u=>['act','sequence','scene','beat'].includes(u.kind));
  const pending=scope.kind==='range'&&(!list.some(o=>o.id===scope.startOccurrenceId)||!list.some(o=>o.id===scope.endOccurrenceId));
  function setKind(kind:LineScope['kind']) {setPick(kind==='range'?'start':null);setScope(kind==='whole'?{kind}:kind==='unit'?{kind,unitId:scopeOptions[0].id}:{kind,startOccurrenceId:'',endOccurrenceId:''});}
  function endpoint(id:string) {if(scope.kind!=='range'||!pick)return;setScope({...scope,...(pick==='start'?{startOccurrenceId:id}:{endOccurrenceId:id})});setPick(pick==='start'?'end':null);}
  function save(e:FormEvent) {e.preventDefault();if(pending)return;const newRole:LineRole={id:role?.id??uid(),basis,scope,prominence,visibility,note};editor.getState().transact(next=>setLineRole(next,line.id,newRole));if(!editor.getState().notice)onDone();}
  return <form className="line-role-form" onSubmit={save} aria-label="Edit scoped role">
    <h3>{role?'編輯區段角色':'新增區段角色'}</h3>
    <label>時間依據<select aria-label="Role time basis" value={basis} onChange={e=>{setBasis(e.target.value as TimeBasis);if(scope.kind==='range'){setScope({kind:'range',startOccurrenceId:'',endOccurrenceId:''});setPick('start');}}}>{(['reality','narrative','audience'] as const).map(b=><option key={b} value={b}>{basisLabels[b]}</option>)}</select></label>
    <label>適用範圍<select aria-label="Role scope" value={scope.kind} onChange={e=>setKind(e.target.value as LineScope['kind'])}><option value="whole">整條線</option><option value="unit">Act / Sequence / Scene / Beat</option><option value="range">自訂起訖</option></select></label>
    {scope.kind==='unit'&&<label>單元<select aria-label="Role scope unit" value={scope.unitId} onChange={e=>setScope({kind:'unit',unitId:e.target.value})}>{!scopeOptions.some(u=>u.id===scope.unitId)&&<option value={scope.unitId}>已刪除；重新選擇</option>}{scopeOptions.map(u=><option key={u.id} value={u.id}>{u.kind} · {u.title}</option>)}</select></label>}
    {scope.kind==='range'&&<div className="range-picker"><div className="range-endpoints"><button type="button" aria-label="Pick role start" aria-pressed={pick==='start'} onClick={()=>setPick('start')}>起點 {list.findIndex(o=>o.id===scope.startOccurrenceId)>=0?'#'+(list.findIndex(o=>o.id===scope.startOccurrenceId)+1):'未選'}</button><button type="button" aria-label="Pick role end" aria-pressed={pick==='end'} onClick={()=>setPick('end')}>終點 {list.findIndex(o=>o.id===scope.endOccurrenceId)>=0?'#'+(list.findIndex(o=>o.id===scope.endOccurrenceId)+1):'未選'}</button></div><p role="status">{pick==='start'?'點一下起點，接著點終點':pick==='end'?'再點一下終點':pending?'端點已失效；請重新選擇':'起訖已選好，可再點按鈕修改'} · 含兩端</p><div className="range-occurrences">{list.map((o,i)=><button type="button" key={o.id} aria-label={`Range occurrence ${i+1}: ${p.units.find(u=>u.id===o.eventId)?.title}`} aria-pressed={o.id===scope.startOccurrenceId||o.id===scope.endOccurrenceId} disabled={!pick} onClick={()=>endpoint(o.id)}><b>#{i+1}</b><span>{p.units.find(u=>u.id===o.eventId)?.title}<small>{o.mode} · {o.id}</small></span></button>)}</div><small>重排後以兩個固定端點之間的目前順序為準；同一事件的每次呈現分開選取。</small></div>}
    <div className="line-dimensions"><label>主副角色<select aria-label="Line prominence" value={prominence} onChange={e=>setProminence(e.target.value as Prominence)}>{(['unspecified','main','sub'] as const).map(v=><option key={v} value={v}>{v==='unspecified'?'未指定／沿用外層':prominenceLabels[v]}</option>)}</select></label><label>明暗角色<select aria-label="Line visibility" value={visibility} onChange={e=>setVisibility(e.target.value as Visibility)}>{(['unspecified','overt','covert'] as const).map(v=><option key={v} value={v}>{v==='unspecified'?'未指定／沿用外層':visibilityLabels[v]}</option>)}</select></label></div>
    <label>設定註記<textarea aria-label="Role note" rows={2} maxLength={20000} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <p className="line-help">自訂區段優先，其次較深的單元，最後整條線。兩個維度各自套用；同層矛盾會標示衝突。</p>
    <div className="line-actions"><button type="submit" disabled={pending|| (scope.kind==='unit'&&!p.units.some(u=>u.id===scope.unitId)) || (prominence==='unspecified'&&visibility==='unspecified')}>儲存角色</button><button type="button" onClick={onDone}>取消</button></div>
  </form>;
}
function LineIdentity({line}:{line:NarrativeLine}) {
  const [title,setTitle]=useState(line.title);useEffect(()=>setTitle(line.title),[line.title]);
  return <div className="line-identity"><label>名稱<input placeholder="例如：A 線、B 線" aria-label="Narrative line title" value={title} maxLength={300} onChange={e=>setTitle(e.target.value)} onBlur={()=>{if(title!==line.title)editor.getState().transact(p=>updateLine(p,line.id,{title}));}}/></label><label>固定顏色<input aria-label="Narrative line color" type="color" value={line.color} onChange={e=>editor.getState().transact(p=>updateLine(p,line.id,{color:e.target.value}))}/></label></div>;
}
export default function NarrativeLinesPanel() {
  const p=useEditor(s=>s.project),lineId=useEditor(s=>s.lineId),selectedId=useEditor(s=>s.selectedId),basis=useEditor(s=>s.basis),occurrenceId=useEditor(s=>s.occurrenceId);
  const lines=p.narrativeLines??[],line=lines.find(l=>l.id===lineId)??lines[0];
  const [editing,setEditing]=useState<string|null>(null);
  useEffect(()=>setEditing(null),[line?.id]);
  const selected=p.units.find(u=>u.id===selectedId),events=lineEvents(p,selectedId),list=p.timelines[basis].placements,index=list.findIndex(o=>o.id===resolveHoloSelection(p,basis,selectedId,occurrenceId)?.id);
  const resolved=line&&lineRolesAt(p,line,basis).get(index);
  const currentRole=editing&&editing!=='new'?line?.roles.find(r=>r.id===editing):undefined;
  useEffect(()=>{if(editing&&editing!=='new'&&!currentRole)setEditing(null);},[editing,currentRole]);
  function create() {let id='';editor.getState().transact(next=>{id=addLine(next,events);});if(id&&!editor.getState().notice){editor.setState({lineId:id});setEditing(null);}}
  return <div className="inspector-content narrative-lines-panel">
    <div className="line-panel-heading"><h2 className="icon-heading"><AtlasIcon name="sequence"/>故事線管理</h2><button onClick={create} disabled={lines.length>=24} aria-label="Create narrative line" title="新增一條可自行命名的故事線">＋ 新線</button></div>
    <p className="line-help">名稱由你決定；主副、明暗只控制各區段的線條樣式。</p>
    {!!lines.length&&<label>目前故事線<select aria-label="Selected narrative line" value={line?.id} onChange={e=>editor.setState({lineId:e.target.value})}>{lines.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label>}
    {!line?<div className="line-empty"><p>還沒有敘事線。新線會包含目前選取單元的事件，也可自行增減。</p><small>角色設定不會從人物視角、事件揭露或觀眾知識自動推測。</small></div>:<>
      {line.example&&<span className="badge">示例設定</span>}<LineIdentity key={line.id} line={line}/>
      <div className="line-current"><strong style={{color:line.color}}>{line.title}</strong><span>{basisLabels[basis]}{index>=0?' #'+(index+1):''} · {resolved?roleLabel(resolved):selected?.kind!=='beat'&&events.some(id=>line.eventIds.includes(id))?'此單元含本線事件；選取單次呈現查看':'此處沒有本線事件'}</span></div><LineLegend/>
      {roleWarnings(p,line).map(w=><p className="line-warning" role="alert" key={w.id}>{w.message}</p>)}
      <details className="line-membership"><summary>{line.eventIds.length} 個關聯事件</summary><button disabled={!events.length||events.every(id=>line.eventIds.includes(id))} onClick={()=>editor.getState().transact(next=>updateLine(next,line.id,{eventIds:[...new Set([...line.eventIds,...events])]}))}>加入選取單元：{selected?.title}</button><div>{p.units.filter(u=>u.kind==='beat').map(u=><label key={u.id}><input type="checkbox" aria-label={`Line member: ${u.title}`} checked={line.eventIds.includes(u.id)} onChange={e=>editor.getState().transact(next=>updateLine(next,line.id,{eventIds:e.target.checked?[...line.eventIds,u.id]:line.eventIds.filter(id=>id!==u.id)}))}/><span>{u.title}</span></label>)}</div></details>
      <div className="line-panel-heading"><h3>區段角色</h3><button onClick={()=>setEditing('new')} disabled={line.roles.length>=100}>＋ 角色</button></div>
      {!line.roles.length&&<p className="line-help">角色尚未指定。可先設定整條線，再加入局部變化。</p>}
      <div className="line-role-list">{line.roles.map(role=><div key={role.id} className={resolveScope(p,role).warning?'suspended':''}><button className="line-role-summary" onClick={()=>setEditing(role.id)}><b>{roleLabel(role)}</b><span>{basisLabels[role.basis]} · {scopeTitle(p,role)}</span>{role.note&&<small>{role.note}</small>}</button><button aria-label={`Remove role ${role.id}`} title="刪除角色設定" onClick={()=>{editor.getState().transact(next=>removeLineRole(next,line.id,role.id));if(editing===role.id)setEditing(null);}}>×</button></div>)}</div>
      {editing&&<RoleEditor key={line.id+'|'+editing+'|'+JSON.stringify(currentRole)} line={line} role={currentRole} onDone={()=>setEditing(null)}/>}
      <p className="line-help">明暗描述這條線的呈現方式，不等於真相、揭露程度或觀眾已知。那些設定仍各自獨立。</p>
      <details><summary>線的管理</summary><button className="danger" onClick={()=>{if(confirm(`刪除「${line.title}」與它的角色設定？原有事件仍會保留，可復原。`)){editor.getState().transact(next=>removeLine(next,line.id));setEditing(null);}}}>刪除此線</button></details>
    </>}
  </div>;
}
