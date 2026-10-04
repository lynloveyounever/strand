import { cursorOccurrence, occurrenceMappings, type TimelineCursor } from './playback';
import { AtlasIcon, KindIcon, kindNames, basisNames } from "./AtlasIcon";
import { readingViews, readingCamera, type ReadingView } from './views';
import { LineShelf, LineLegend, openLine } from './NarrativeLines';
import { lineRolesAt, lineStroke, roleLabel } from './lines';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { editor, useEditor } from './store';
import { descendants, orderedBeats, ranges, scaleAt, kindAt } from './model';
import { axisView, bases, basisLabels, eventMappings, moveOccurrences, stateAtBasis, type TimeBasis } from './temporal';
import { entityPoint, orbitCamera, interpolateAngle, hologramEntities, prismProjection, homeCamera, layerColors, mix, projectPoint, resolveHoloSelection, type Camera, type HoloEntity, type Vec3 } from './hologram';

export default function Hologram({ onFlat, previewEventId, referenceCursor }: { onFlat: () => void; previewEventId?: string; referenceCursor?: TimelineCursor | null }) {
  const p = useEditor(s=>s.project), zoom = useEditor(s=>s.zoom), selectedId = useEditor(s=>s.selectedId), basis = useEditor(s=>s.basis), occurrenceId = useEditor(s=>s.occurrenceId), trackId = useEditor(s=>s.trackId), lineId = useEditor(s=>s.lineId);
  const [reading,setReading] = useState<TimeBasis|null>(null);
  const cameraAnimation = useRef<number|null>(null);
  const [camera,setCamera] = useState<Camera>(homeCamera), [compression,setCompression] = useState(0.18), [gesture,setGesture] = useState<'orbit'|'pan'>('orbit'), [showArcs,setShowArcs] = useState(true), [listOpen,setListOpen] = useState(false);
  const [size,setSize] = useState({width:Math.min(window.innerWidth,1200),height:window.innerWidth<650?500:570});
  const surface = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), animation = useRef<number | null>(null);
  const pointers = useRef(new Map<number,{x:number;y:number}>()), moved = useRef(false);
  const [reduced,setReduced] = useState(false);
  useEffect(()=>{ const q = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!q) return; setReduced(q.matches); const cb = ()=>setReduced(q.matches);q.addEventListener('change',cb);return()=>q.removeEventListener('change',cb); },[]);
  useEffect(()=>{ if (!surface.current || typeof ResizeObserver==='undefined') return; const ro = new ResizeObserver(([e])=>setSize({width:Math.max(300,e.contentRect.width),height:Math.max(280,e.contentRect.height)}));ro.observe(surface.current);return()=>ro.disconnect(); },[]);
  useEffect(()=>()=>{if(animation.current!==null)cancelAnimationFrame(animation.current);if(cameraAnimation.current!==null)cancelAnimationFrame(cameraAnimation.current);},[]);
  const nodes = useMemo(()=>hologramEntities(p,zoom,compression),[p,zoom,compression]);
  const canonicalRanges = useMemo(()=>ranges(p),[p]), canonicalLength = orderedBeats(p).length;
  const selected = p.units.find(u=>u.id===selectedId);
  const eventIds = useMemo(()=>new Set(selected ? (selected.kind==='beat'?[selected.id]:descendants(p,selected.id).filter(u=>u.kind==='beat').map(u=>u.id)) : []),[p,selected]);
  const activeOccurrence = resolveHoloSelection(p,basis,selectedId,occurrenceId);
  const activeIndex = activeOccurrence ? p.timelines[basis].placements.indexOf(activeOccurrence) : -1;
  const tracks = trackId==='author' ? p.tracks.slice(0,4) : p.tracks.filter(t=>t.id===trackId);
  const selectedOccurrences = useMemo(()=>Object.fromEntries(bases.map(b=>[b,new Set(p.timelines[b].placements.filter(o=>eventIds.has(o.eventId)).map(o=>o.id))])) as Record<TimeBasis,Set<string>>,[p,eventIds]);
  const activeTrack = tracks[0];
  const project = (point:Vec3)=> {
    if(size.width<650) { const q=projectPoint(point,{...camera,panX:0,panY:0},size.height,size.width); return {...q,x:size.width-q.y+camera.panX,y:q.x+camera.panY}; }
    return projectPoint(point,camera,size.width,size.height);
  };
  const path = (points:Vec3[])=>points.map((v,i)=>{const q=project(v);return `${i?'L':'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`;}).join(' ');
  const relevant = (node:HoloEntity)=> node.unit.canonicalId===selectedId || node.unit.occurrenceIds.some(id=>selectedOccurrences[node.basis].has(id));
  function select(node:HoloEntity) {
    const first = p.timelines[node.basis].placements.find(o=>o.id===node.unit.occurrenceIds[0]);
    editor.setState({selectedId:node.unit.canonicalId,basis:node.basis,occurrenceId:first?.id ?? '',playhead:node.start+0.5});
  }
  function animateTo(target:number) {
    if(animation.current!==null)cancelAnimationFrame(animation.current);
    if(reduced || typeof requestAnimationFrame==='undefined') {setCompression(target);return;}
    const from=compression,start=performance.now();
    const step=(now:number)=>{const t=Math.min(1,(now-start)/650);setCompression(mix(from,target,t*t*(3-2*t)));if(t<1)animation.current=requestAnimationFrame(step);else animation.current=null;};
    animation.current=requestAnimationFrame(step);
  }
  function focus() {
    freeCamera();
    const node=nodes.find(n=>n.basis===basis && relevant(n) && (selected?.kind!=='beat' || !activeOccurrence || n.unit.occurrenceIds.includes(activeOccurrence.id)));if(!node)return;
    const q=project(node.point);
    setCamera(c=>({...c,panX:c.panX+size.width/2-q.x,panY:c.panY+size.height/2-q.y}));
  }
  function chooseReading(view:ReadingView) {
    setReading(view.focusBasis);
    const target=readingCamera(view,size.width,size.height,(c,point)=>{
      if(size.width<650){const q=projectPoint(point,c,size.height,size.width);return {x:size.width-q.y,y:q.x};}
      return projectPoint(point,c,size.width,size.height);
    });
    if(cameraAnimation.current!==null)cancelAnimationFrame(cameraAnimation.current);
    if(reduced||typeof requestAnimationFrame==='undefined'){setCamera(target);return;}
    const from=camera,start=performance.now();
    const frame=(now:number)=>{const t=Math.min(1,(now-start)/400),ease=t*t*(3-2*t);setCamera({yaw:interpolateAngle(from.yaw,target.yaw,ease),pitch:interpolateAngle(from.pitch,target.pitch,ease),zoom:mix(from.zoom,target.zoom,ease),panX:mix(from.panX,target.panX,ease),panY:mix(from.panY,target.panY,ease)});if(t<1)cameraAnimation.current=requestAnimationFrame(frame);else cameraAnimation.current=null;};
    cameraAnimation.current=requestAnimationFrame(frame);
  }
  function freeCamera(){setReading(null);if(cameraAnimation.current!==null){cancelAnimationFrame(cameraAnimation.current);cameraAnimation.current=null;}}
  function down(e:ReactPointerEvent<SVGSVGElement>) {
    if(e.button!==0)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});moved.current=false;

  }
  function move(e:ReactPointerEvent<SVGSVGElement>) {
    const old=pointers.current.get(e.pointerId);if(!old)return;
    const dx=e.clientX-old.x,dy=e.clientY-old.y;if(dx||dy)freeCamera();if(Math.abs(dx)+Math.abs(dy)>2){moved.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);}
    const other=[...pointers.current.entries()].find(([id])=>id!==e.pointerId)?.[1];
    if(other) {
      const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
      setCamera(c=>({...c,zoom:Math.max(0.45,Math.min(4,c.zoom*(before?after/before:1))),panX:c.panX+dx/2,panY:c.panY+dy/2}));
    } else if(gesture==='pan'||e.shiftKey) setCamera(c=>({...c,panX:c.panX+dx,panY:c.panY+dy}));
    else setCamera(c=>orbitCamera(c,dx*.005,dy*.005));
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  }
  const axisNodes=nodes.filter(n=>n.basis===basis);
  const navigationIndex=axisNodes.findIndex(n=>n.unit.canonicalId===selectedId&&(selected?.kind!=='beat'||!activeOccurrence||n.unit.occurrenceIds.includes(activeOccurrence.id)));
  const prism = useMemo(()=>prismProjection(p,selectedId),[p,selectedId]);
  const playbackPoint = cursorOccurrence(p, referenceCursor ?? null);
  const playbackMappings = referenceCursor && playbackPoint ? occurrenceMappings(p, referenceCursor) : [];
  const activeLine = p.narrativeLines?.find(l=>l.id===lineId) ?? p.narrativeLines?.[0];
  return <section className="holo" aria-label="Holographic narrative viewer">
    <div className="holo-toolbar">
      <div className="holo-title"><AtlasIcon name="cube"/><div><strong>3D 對應圖</strong><small>目前顯示<KindIcon kind={kindAt(zoom)}/>{kindNames[kindAt(zoom)]} · 同一單元在三種順序的位置</small></div></div>
      <details className="camera-tools"><summary aria-label="Camera tools" title="展開視角操作"><AtlasIcon name="cube"/><span>視角工具</span><AtlasIcon name="chevron" className="disclosure-chevron"/></summary><div className="holo-camera" role="group" aria-label="3D camera controls">
        <button aria-label="Orbit" title="拖動可水平與垂直連續旋轉" aria-pressed={gesture==='orbit'} onClick={()=>setGesture('orbit')}>旋轉</button><button aria-label="Pan" title="拖動平移整張對應圖" aria-pressed={gesture==='pan'} onClick={()=>setGesture('pan')}>平移</button>
        <button aria-label="Camera zoom out" onClick={()=>{freeCamera();setCamera(c=>({...c,zoom:Math.max(.45,c.zoom/1.2)}));}}>−</button><button aria-label="Camera zoom in" onClick={()=>{freeCamera();setCamera(c=>({...c,zoom:Math.min(4,c.zoom*1.2)}));}}>＋</button>
        <button aria-label="Focus selection" onClick={focus}>聚焦選取</button><button aria-label="Reset view" onClick={()=>{freeCamera();setCamera(homeCamera);}}>重設視角</button>
        <label><input type="checkbox" checked={showArcs} onChange={e=>setShowArcs(e.target.checked)}/> 視角狀態連線</label>
      </div></details>
      <button aria-label="2D editor" onClick={onFlat} title="切換中央工作區為單線細節編輯">切換 2D 編輯</button>
    </div>
    <div className="holo-read-views" data-control-region="3d-camera" role="group" aria-label="Reading angles"><small>觀察平面</small>{readingViews.map(view=><button key={view.id} aria-pressed={reading===view.id} onClick={()=>chooseReading(view)} title={`同一空間，聚焦 ${view.label} 平面`}>{view.label}</button>)}<button aria-pressed={reading===null} onClick={freeCamera}>自由</button></div>
    <LineShelf/>
    {trackId==='author'&&p.tracks.length>4&&<p className="holo-track-limit">Showing the first four perspective paths. Use “View as” to isolate any of the {p.tracks.length} perspectives.</p>}
    <div className="holo-surface" ref={surface} data-reading-view={reading??"free"} data-camera-yaw={camera.yaw} data-camera-pitch={camera.pitch}>
      <div className="holo-legend">{bases.map(b=><span key={b} style={{color:layerColors[b]}}>{basisNames[b]} </span>)}<span className="holo-selection-legend"><i className="active"/>編輯選取 <i/>同一事件的其他位置</span></div>
      <svg ref={svg} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="Three dimensional narrative map. Drag to orbit; use Pan or two fingers to move; pinch to zoom. Arrow keys rotate, plus and minus zoom." tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={e=>{pointers.current.delete(e.pointerId);}} onPointerCancel={e=>{pointers.current.delete(e.pointerId);moved.current=true;}} onKeyDown={e=>{
        if(e.target!==e.currentTarget)return;
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key)){freeCamera();e.preventDefault();}
        if(e.key==='Home')setCamera(homeCamera);
        else if(e.key==='+'||e.key==='=')setCamera(c=>({...c,zoom:Math.min(4,c.zoom*1.2)}));
        else if(e.key==='-')setCamera(c=>({...c,zoom:Math.max(.45,c.zoom/1.2)}));
        else if(e.key.startsWith('Arrow'))setCamera(c=>orbitCamera(c,e.key==='ArrowRight'?.1:e.key==='ArrowLeft'?-.1:0,e.key==='ArrowDown'?.1:e.key==='ArrowUp'?-.1:0));
      }}>
        <defs>{bases.map(b=><marker key={b} id={"time-arrow-"+b} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8" fill="none" stroke={layerColors[b]} strokeWidth="1.5"/></marker>)}<pattern id="holo-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#46616c" opacity=".28"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#holo-grid)"/>
        {[...bases].reverse().map(b=>{
          const axis=axisView(p,b),length=p.timelines[b].placements.length;
          const plane=[{x:-400,y:40,z:(bases.indexOf(b)-1)*250-35},{x:400,y:40,z:(bases.indexOf(b)-1)*250-35},{x:400,y:40,z:(bases.indexOf(b)-1)*250+35},{x:-400,y:40,z:(bases.indexOf(b)-1)*250+35}];
          return <g key={b} style={{color:layerColors[b]}} opacity={!reading||reading===b?1:.22}>
            <path d={path(plane)+'Z'} fill="currentColor" fillOpacity=".025" stroke="currentColor" strokeOpacity=".2"/>
            <path d={path([entityPoint(b,0,length,'beat',compression),entityPoint(b,length,length,'beat',compression)])} stroke="currentColor" strokeOpacity=".5" fill="none" markerEnd={`url(#time-arrow-${b})`} data-edge-kind="temporal-order"><title>{basisLabels[b]}：時間順序，並非因果</title></path>
            {axis.units.filter(u=>b==='narrative'&&(u.kind==='act'||(u.kind==='scene'&&zoom>=50))).map(u=>{const r=axis.ranges.get(u.id)!;const source=canonicalRanges.get(u.canonicalId)!;const a=entityPoint(b,r.start,length,u.kind,compression),end=entityPoint(b,r.end,length,u.kind,compression);a.x=mix(-360+720*source.start/canonicalLength,a.x,compression);end.x=mix(-360+720*source.end/canonicalLength,end.x,compression);const bottom=mix(u.kind==='act'?25:12,0,compression);return <path data-container-kind={u.kind} key={u.id} d={path([a,end,{...end,y:bottom},{...a,y:bottom}])+'Z'} fill="currentColor" fillOpacity={u.kind==='act'?'.08':'.12'} stroke="currentColor" strokeWidth={u.kind==='act'?2:1} strokeOpacity=".42"><title>{u.kind+": "+u.title}</title></path>;})}
            {showArcs && tracks.filter(t=>b!=='reality'||t.kind==='character').map((t,ti)=>{
              // State is categorical. Height separates perspectives; it does not invent an emotional score.
              const points=p.timelines[b].placements.map((o,i)=>({...entityPoint(b,i+.5,length,'beat',compression),y:mix(65+ti*30,12+ti*5,compression)}));
              return <g key={t.id} style={{color:t.color}}><path d={path(points)} fill="none" stroke="currentColor" strokeWidth={trackId===t.id?2:1} strokeOpacity=".45"/>{points.map((pt,i)=>{
                const o=p.timelines[b].placements[i];const authored=b==='reality'||(b==='narrative'&&t.kind==='character')?p.transitions.some(tr=>tr.eventId===o.eventId&&tr.trackId===t.id):o.updates.some(tr=>tr.trackId===t.id);
                if(!authored || (b==='narrative'&&t.kind==='character'&&!p.timelines.reality.placements.some(anchor=>anchor.eventId===o.eventId)))return null;const q=project(pt);return <circle key={o.id} cx={q.x} cy={q.y} r={eventIds.has(o.eventId)?4:2} fill="currentColor"><title>{`${t.name}: ${stateAtBasis(p,t.id,i+.5,b).snapshot.state}`}</title></circle>;
              })}</g>;
            })}
          </g>;
        })}
        {activeLine&&bases.map(b=>{
          const roles=lineRolesAt(p,activeLine,b),length=p.timelines[b].placements.length;
          let previous='';
          return <g key={'line-'+b} opacity={!reading||reading===b?1:.25} aria-label={`${activeLine.title} on ${basisLabels[b]}`}>
            {[...roles].map(([i,role])=>{
              const style=lineStroke(role),label=roleLabel(role),changed=previous!==''&&previous!==label;previous=label;
              const a={...entityPoint(b,i+.08,length,'beat',1),y:mix(108,35,compression)},end={...entityPoint(b,i+.92,length,'beat',1),y:mix(108,35,compression)},q=project(a),o=p.timelines[b].placements[i];
              const conflict=role.prominence==='conflict'||role.visibility==='conflict';
              return <g key={o.id} data-line-id={activeLine.id} data-role={label} data-line-occurrence={o.id} role="button" tabIndex={0} aria-label={`${activeLine.title}: ${basisLabels[b]} #${i+1}, ${label}`} onClick={()=>{if(moved.current)return;editor.setState({selectedId:o.eventId,basis:b,occurrenceId:o.id,playhead:i+.5});openLine(activeLine.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editor.setState({selectedId:o.eventId,basis:b,occurrenceId:o.id,playhead:i+.5});openLine(activeLine.id);}}}>
                <title>{activeLine.title+' · '+label+' · 事件關聯，非因果'}</title><path d={path([a,end])} stroke="transparent" strokeWidth="20" fill="none"/><path d={path([a,end])} stroke={conflict?'#ffb879':activeLine.color} strokeWidth={style.width} strokeDasharray={style.dash} fill="none"/>
                {(changed||conflict)&&<path d={`M${q.x} ${q.y-5}l5 5l-5 5l-5 -5Z`} fill={conflict?'#ffb879':'#102332'} stroke={activeLine.color} data-role-transition="true"/>}
              </g>;
            })}
          </g>;
        })}
        {prism&&<g className="prism-projection" aria-label="Selected entity projection">
          {prism.targets.map(target=>{const q=project(target.point);return <g key={target.item.id}><path className="holo-correspondence" data-edge-kind="identity-projection" data-target-occurrence={target.item.id} d={path([prism.source,target.point])} fill="none" stroke={layerColors[target.basis]} strokeWidth="1" strokeDasharray="2 6" opacity=".38"><title>{selected?.title+' → '+basisLabels[target.basis]+' #'+(target.index+1)+' · 同一事件的投影，並非因果'}</title></path><circle cx={q.x} cy={q.y} r="3" fill={layerColors[target.basis]} opacity=".7"/></g>;})}
          {(()=>{const q=project(prism.source);return <g data-canonical-source={selectedId}><path d={`M${q.x} ${q.y-10}l10 6v10l-10 6l-10 -6v-10Z`} fill="#162d3b" stroke="#e3f2fa" strokeWidth="1.5"/><text x={q.x} y={q.y-17} textAnchor="middle" fill="#e3f2fa" fontSize="12" stroke="#101c27" strokeWidth="4" paintOrder="stroke">{selected?.title} · 共用{selected ? kindNames[selected.kind] : '單元'}</text></g>;})()}
        </g>}
        {[...nodes].sort((a,b)=>project(b.point).depth-project(a.point).depth).map(node=>{
          const q=project(node.point), chosen=relevant(node), exact=node.unit.canonicalId===selectedId&&node.basis===basis&&(selected?.kind!=='beat'||!activeOccurrence||node.unit.occurrenceIds.includes(activeOccurrence.id));
          const landing=project({...entityPoint(node.basis,(node.start+node.end)/2,node.length,'beat',1),y:0});
          const left=project(entityPoint(node.basis,node.start,node.length,node.unit.kind,compression)),right=project(entityPoint(node.basis,node.end,node.length,node.unit.kind,compression));
          const showLabel=exact || (size.width>650 && (node.unit.kind!=='beat'||node.start%4===0));
          return <g key={node.key} className={'holo-node'+(exact?' selected':chosen?' corresponding':'')} data-selection-kind={exact?'active':chosen?'corresponding':'other'} role="button" tabIndex={0} aria-label={`${basisLabels[node.basis]} ${node.unit.kind}: ${node.unit.title}, position ${node.start+1}${node.end>node.start+1?' to '+node.end:''}`} data-event-id={node.unit.canonicalId} data-occurrence-ids={node.unit.occurrenceIds.join(',')} onClick={()=>{if(!moved.current)select(node);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(node);}}} style={{color:layerColors[node.basis]}} opacity={previewEventId ? node.unit.canonicalId === previewEventId || node.unit.occurrenceIds.some(id => p.timelines[node.basis].placements.some(o => o.id === id && o.eventId === previewEventId)) ? 1 : .16 : !reading||reading===node.basis||exact?1:.3}>
            <title>{`${node.unit.title} · ${node.unit.occurrenceIds.length} occurrence(s)`}</title>
            {compression<.99&&<path d={`M${q.x},${q.y}L${landing.x},${landing.y}`} fill="none" stroke="currentColor" strokeDasharray="2 4" strokeOpacity={chosen?".5":".12"}/> }
            {node.unit.kind!=='beat'&&<path d={`M${left.x},${left.y}L${right.x},${right.y}`} stroke="currentColor" strokeWidth={chosen?7:4} strokeOpacity={chosen?'.8':'.4'}/>}
            <circle cx={q.x} cy={q.y} r="22" fill="none" pointerEvents="all"/>
            {exact&&<circle cx={q.x} cy={q.y} r="12" fill="none" stroke="currentColor" strokeWidth="1"/>}
            <circle cx={q.x} cy={q.y} r={exact?8:chosen?6:5} fill={exact?'currentColor':'#24242b'} stroke="currentColor" strokeWidth={chosen?'2':'1.5'} strokeOpacity={chosen?'1':'.6'}/>
            {showLabel&&<text textAnchor={size.width<650?"middle":"start"} x={size.width<650?q.x:q.x+11} y={q.y-16} fill={chosen?'#eff6fc':'currentColor'} fontSize="14" paintOrder="stroke" stroke="#101c27" strokeWidth="4" strokeLinejoin="round">{node.unit.title.length>14?node.unit.title.slice(0,13)+'…':node.unit.title}</text>}
          </g>;
        })}
        {!!playbackPoint && <g aria-label="播放參考位置">{playbackMappings.flatMap(mapping => mapping.candidates.map(({item,index}) => {
          const exact = mapping.basis === referenceCursor?.basis && item.id === referenceCursor.occurrenceId;
          const point = project({...entityPoint(mapping.basis,index+.5,p.timelines[mapping.basis].placements.length,'beat',1),y:0});
          return <g key={'playback-'+item.id} data-playback-occurrence={item.id} data-playback-kind={exact?'reference':'corresponding'}><path d={`M${point.x} ${point.y-9}l7 9-7 9-7 -9Z`} stroke="#f1f1fa" fill={exact?'#f1f1fa':'#292932'} strokeWidth="1.5" strokeDasharray={exact?undefined:'2 2'}/>{exact&&<text x={point.x} y={point.y+32} textAnchor="middle" fontSize="12" fill="#f2f2fb" stroke="#202028" strokeWidth="4" paintOrder="stroke">播放 · 第 {index+1} 步</text>}<title>{exact?'播放參考':'同一事件對應，並非同時'} · {basisNames[mapping.basis]}第 {index+1} 步</title></g>;
        }))}</g>}
      </svg>
      <div className="holo-hint"><span>實線：先後順序 · 虛線：同一故事單元的對應</span>{activeLine&&<LineLegend/>}{showArcs&&<div className="holo-path-legend">{tracks.map(t=><span key={t.id} style={{color:t.color}}><i/> {t.name}</span>)}</div>}</div>
    </div>
    <div className="holo-projection">
      <button onClick={()=>animateTo(0)} aria-label="Expand entities" title="展開故事元素，查看同一單元在三條線的對應" aria-pressed={compression===0}><AtlasIcon name="cube"/><span>展開故事元素</span></button>
      <label><span>排列程度 <b>{Math.round(compression*100)}%</b></span><input aria-label="Timeline compression" type="range" min="0" max="100" value={Math.round(compression*100)} onChange={e=>{if(animation.current!==null)cancelAnimationFrame(animation.current);setCompression(Number(e.target.value)/100);}} /></label>
      <button onClick={()=>animateTo(1)} aria-label="Project to timelines" title="將故事元素依各線的先後順序排列" aria-pressed={compression===1}><AtlasIcon name="path"/><span>排列成時間線</span></button>
    </div>
    <div className="holo-selection">
      <button aria-label="Previous entity" title="Previous entity" disabled={navigationIndex<=0} onClick={()=>select(axisNodes[navigationIndex-1])}>‹</button>
      <div><small>{selected && <KindIcon kind={selected.kind}/>} {selected ? kindNames[selected.kind] : '故事單元'} · {basisNames[basis]}{activeIndex>=0?' #'+(activeIndex+1):''}</small><strong>{selected?.title ?? 'Select an entity'}</strong></div>
      <button aria-label="Next entity" title="Next entity" disabled={navigationIndex<0||navigationIndex>=axisNodes.length-1} onClick={()=>select(axisNodes[navigationIndex+1])}>›</button>
      <button aria-label="Edit selected entity" title="開啟右側內容編輯；修改所有位置共用的事件" onClick={()=>editor.setState({panel:'edit',inspectorOpen:true,outlineOpen:false})} disabled={!selected}><AtlasIcon name="edit"/><span>編輯內容</span></button>
      <button aria-label="Selection details" title="開啟右側選取詳情；查看此刻狀態" onClick={()=>editor.setState({panel:'cursor',inspectorOpen:true,outlineOpen:false})}><AtlasIcon name="person"/><span>此刻狀態</span></button>
    </div>
    <details className="holo-more"><summary>Connections & navigation<span className="holo-section-hint">對應與位置</span></summary>
    {selected?.kind==='beat'&&<div className="holo-mappings" aria-label="Shared event correspondence">{eventMappings(p,selected.id).map(m=><div key={m.basis}><strong style={{color:layerColors[m.basis]}}>{basisLabels[m.basis]}</strong>{m.items.length?m.items.map(({item,index})=><button key={item.id} aria-pressed={basis===m.basis&&activeOccurrence?.id===item.id} onClick={()=>editor.setState({basis:m.basis,occurrenceId:item.id,playhead:index+.5})}>#{index+1} · {item.mode}{m.basis==='audience'?' · '+item.disclosure:''}</button>):<span>Not mapped</span>}</div>)}</div>}
    {activeTrack&&activeIndex>=0&&<div className="holo-state"><strong style={{color:activeTrack.color}}>{activeTrack.name}</strong><span>{stateAtBasis(p,activeTrack.id,activeIndex+.5,basis).snapshot.state}</span><small>{stateAtBasis(p,activeTrack.id,activeIndex+.5,basis).source}</small></div>}
    <div className="holo-arrange"><button disabled={activeIndex<=0} onClick={()=>{if(!activeOccurrence)return;editor.getState().transact(next=>moveOccurrences(next,basis,[activeOccurrence.id],next.timelines[basis].placements[activeIndex-1].id));editor.setState({playhead:activeIndex-.5});}}>Move earlier</button><button disabled={activeIndex<0||activeIndex>=p.timelines[basis].placements.length-1} onClick={()=>{if(!activeOccurrence)return;editor.getState().transact(next=>moveOccurrences(next,basis,[activeOccurrence.id],next.timelines[basis].placements[activeIndex+1].id));editor.setState({playhead:activeIndex+1.5});}}>Move later</button></div>
    <details className="holo-accessible" open={listOpen} onToggle={e=>setListOpen(e.currentTarget.open)}><summary>Entity list · keyboard & small-screen navigation</summary><div>{nodes.filter(n=>n.basis===basis).map(n=><button key={n.key} onClick={()=>select(n)} aria-pressed={n.unit.canonicalId===selectedId&&(selected?.kind!=='beat'||!activeOccurrence||n.unit.occurrenceIds.includes(activeOccurrence.id))}>{n.start+1}. {n.unit.title}</button>)}</div></details>
    </details>
  </section>;
}
