import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import { isPhoneLayout } from './phoneLayout';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://strand-phone.test' });
for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,confirm:()=>true,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const {render,fireEvent,screen,cleanup,act,within}=await import('@testing-library/react');
const {default:App}=await import('./App');
const {StoryTrackRows}=await import('./StoryTracks');
const {editor,makeStore}=await import('./store');
const {createBlankProject}=await import('./model');
const {createTimelineDemo}=await import('./sample');
const {addOccurrence}=await import('./temporal');
const {newContentTrack,saveContentTrack,contentAnchor}=await import('./storyTracks');
function viewport(width:number,height=800,coarse=true) {
 Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
 Object.defineProperty(window,'innerHeight',{configurable:true,value:height});
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:coarse,addEventListener(){},removeEventListener(){}})});
}
beforeEach(()=>{viewport(390);Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});const {set,transact,undo,redo,importProject,...state}=makeStore(createBlankProject()).getState();editor.setState({...state,outlineOpen:false,inspectorOpen:false});localStorage.clear();});
afterEach(()=>cleanup());

// Static cascade checks evaluate the real import order, selector specificity and media
// conditions. They establish CSS contracts, not browser geometry or device appearance.
const main=readFileSync(new URL('./main.tsx',import.meta.url),'utf8');
const sources=[...main.matchAll(/import\s+["'](.+\.css)["']/g)].map(m=>postcss.parse(readFileSync(new URL(m[1],import.meta.url),'utf8')));
function matchesMedia(query:string,w:number,h:number,coarse:boolean) {
 return query.split(',').some(part=>{
  if (/prefers-|forced-colors/.test(part)) return false;
  const features=[...part.matchAll(/\(([^:]+):\s*([^\)]+)\)/g)];
  return features.every(([,raw,value])=>{const name=raw.trim(),n=parseFloat(value);return name==='max-width'?w<=n:name==='min-width'?w>=n:name==='max-height'?h<=n:name==='min-height'?h>=n:name==='pointer'?(value.trim()==='coarse')===coarse:name==='hover'?(!coarse)===(value.trim()==='hover'):false;});
 });
}
function specificity(selector:string) {
 const stripped=selector.replace(/\[[^\]]*\]/g,'').replace(/::[\w-]+/g,'');
 const ids=(stripped.match(/#[\w-]+/g)||[]).length;
 const classes=(stripped.match(/\.[\w-]+/g)||[]).length+(selector.match(/\[[^\]]*\]/g)||[]).length+(stripped.match(/:(?!not\(|is\(|where\()[\w-]+/g)||[]).length;
 const types=(stripped.replace(/[#.][\w-]+|:[\w-]+|[()*]/g,' ').match(/(?:^|[\s>+~])[a-z][\w-]*/gi)||[]).length;
 return [ids,classes,types];
}
function css(node:Element,property:string,w:number,h=800,coarse=true) {
 let best:number[]=[-1],value='',order=0;
 for(const source of sources) source.walkRules(rule=>{
  let parent=rule.parent;while(parent&&parent.type!=='root'){if(parent.type==='atrule'&&parent.name==='media'&&!matchesMedia(parent.params,w,h,coarse))return;parent=parent.parent;}
  for(const selector of rule.selector.split(/,(?![^()]*\))/)) {
   let match=false;try{match=node.matches(selector);}catch{} if(!match)continue;
   rule.walkDecls(property,decl=>{const score=[decl.important?1:0,...specificity(selector),++order];const wins=score.some((n,i)=>n!==best[i]&&score.slice(0,i).every((n,j)=>n===best[j])&&n>(best[i]??-1));if(wins){best=score;value=decl.value;}});
  }
 });
 return value;
}
function fixture(markup:string){const section=document.createElement('section');section.innerHTML=markup;document.body.append(section);return section;}
for(const width of [320,360,390,430]) {
 test(`${width}px authoring starts with three fields and collapsed, navigable scene picker`,()=>{
  viewport(width);render(<App/>);fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));
  const fields=screen.getAllByRole('textbox').filter(el=>!el.closest('details:not([open])'));
  assert.equal(fields.length,3);const toggle=document.querySelector<HTMLButtonElement>('.author-outline-toggle')!;
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal((document.querySelector('#author-scene-list') as HTMLElement).hidden,true);
  fireEvent.click(toggle);fireEvent.click(screen.getByRole('button',{name:'＋ 場'}));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(editor.getState().project.units.filter(u=>u.kind==='scene').length,2);
  const field=screen.getByLabelText('發生什麼');fireEvent.change(field,{target:{value:'手機上的新場'}});fireEvent.blur(field);assert.equal(editor.getState().project.units.find(u=>u.id===editor.getState().selectedId)?.summary,'手機上的新場');
 });
 test(`${width}px computed source cascade keeps sheets above backdrop, bounded and touch sized`,()=>{
  viewport(width);render(<App/>);fireEvent.click(document.querySelector('[data-opens-sidebar="left"]')!);
  let sheet=screen.getByRole('dialog');const backdrop=screen.getByRole('button',{name:'Back to timeline'});
  assert.ok(Number(css(sheet,'z-index',width))>Number(css(backdrop,'z-index',width)));
  assert.equal(css(sheet,'width',width),'auto');assert.match(css(sheet,'height',width),/--phone-viewport-height/);
  const twisty=sheet.querySelector('.twisty')!;assert.equal(css(twisty,'width',width),'44px');fireEvent.click(backdrop);assert.equal(screen.queryByRole('dialog'),null);
  act(()=>editor.setState({inspectorOpen:true,outlineOpen:false}));sheet=screen.getByRole('dialog',{name:'Story details'});
  assert.ok(Number(css(sheet,'z-index',width))>25);assert.equal(css(sheet.querySelector('.inspector-tabs>button')!,'min-width',width),'48px');
  fireEvent.click(screen.getByRole('button',{name:'Close inspector'}));assert.equal(screen.queryByRole('dialog'),null);
 });
 test(`${width}px reader and workbench source rules prevent columns, titles and tool buttons escaping`,()=>{
  const el=fixture('<div class="app is-mobile"><div class="character-decision"><section></section><section></section></div><div class="navigator-heading"><div></div><button></button></div><div class="layered-view"><div class="layered-view__rail"><button></button></div></div><div class="workspace-edge-tools"><button></button></div><details class="track-visibility" open><div></div></details></div>');
  assert.equal(css(el.querySelector('.character-decision')!,'grid-template-columns',width),'minmax(0,1fr)');
  assert.equal(css(el.querySelector('.character-decision>section+section')!,'border-left',width),'0');
  assert.equal(css(el.querySelector('.navigator-heading')!,'flex-wrap',width),'wrap');
  assert.equal(css(el.querySelector('.layered-view__rail button')!,'white-space',width),'normal');
  assert.equal(css(el.querySelector('.workspace-edge-tools>button')!,'min-height',width),'44px');
  assert.equal(css(el.querySelector('.track-visibility>div')!,'position',width),'static');
  assert.match(css(el.querySelector('.track-visibility>div')!,'max-height',width),/45dvh/);el.remove();
 });
}
test('coarse-pointer landscape retains phone sheets and Escape while desktop stays desktop',()=>{
 assert.equal(isPhoneLayout(844,390,true),true);assert.equal(isPhoneLayout(844,390,false),false);assert.equal(isPhoneLayout(1440,900,true),false);
 viewport(844,390);render(<App/>);assert.ok(document.querySelector('.app.is-mobile'));act(()=>editor.setState({inspectorOpen:true}));const sheet=screen.getByRole('dialog',{name:'Story details'});assert.equal(css(sheet,'display',844,390),'block');assert.equal(css(sheet,'overflow',844,390),'auto');assert.equal(css(sheet.querySelector('.inspector-content')!,'overflow',844,390),'visible');
 fireEvent.keyDown(window,{key:'Escape'});assert.equal(screen.queryByRole('dialog'),null);
});
test('visual viewport changes resize the shell and sheets, and pinch zoom does not reflow them',()=>{
 const vv=new window.EventTarget() as any;Object.assign(vv,{height:780,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});render(<App/>);
 assert.equal(document.documentElement.style.getPropertyValue('--phone-viewport-height'),'780px');
 act(()=>{vv.height=340;vv.offsetTop=20;vv.dispatchEvent(new window.Event('resize'));});assert.equal(document.documentElement.style.getPropertyValue('--phone-viewport-height'),'340px');assert.equal(document.documentElement.style.getPropertyValue('--phone-viewport-top'),'20px');
 act(()=>{vv.scale=2;vv.height=170;vv.dispatchEvent(new window.Event('resize'));});assert.equal(document.documentElement.style.getPropertyValue('--phone-viewport-height'),'340px');
 cleanup();assert.equal(document.documentElement.style.getPropertyValue('--phone-viewport-height'),'');
});
for(const count of [14,40])test(`${count} occurrence content lanes reserve 44px targets without changing project data`,()=>{
 const p=createTimelineDemo();while(p.timelines.narrative.placements.length<count)addOccurrence(p,'narrative','e1');if(p.timelines.narrative.placements.length>count)p.timelines.narrative.placements=p.timelines.narrative.placements.slice(0,count);
 const before=JSON.stringify(p);editor.setState({project:p,trackingOwner:'all',trackingDimension:'all',hiddenContentTrackIds:[]});render(<StoryTrackRows p={p} basis="narrative" occurrenceId={p.timelines.narrative.placements[0].id}/>);
 const lanes=document.querySelectorAll<HTMLElement>('.content-lane-scroll');assert.ok(lanes.length>0);
 for(const lane of lanes){assert.equal(lane.style.getPropertyValue('--content-lane-touch-width'),`${count*44}px`);const targets=lane.querySelectorAll('button');assert.equal(targets.length,count);assert.equal(css(targets[0],'min-width',320),'44px');assert.equal(css(lane,'overflow-x',320),'auto');}
 assert.equal(JSON.stringify(p),before);
});
test('desktop styles remain a two-column reader and compact content lanes',()=>{
 const el=fixture('<div class="character-decision"></div><div class="content-lane-scroll"><div class="content-state-lane"><button></button></div></div>');assert.equal(css(el.querySelector('.character-decision')!,'grid-template-columns',1440,900,false),'1fr 1.2fr');assert.equal(css(el.querySelector('.content-lane-scroll')!,'overflow-x',1440,900,false),'');el.remove();
});
test('Project and Help modal height reserves both safe-area edges in a short visual viewport',()=>{
 const el=fixture('<div class="modal-backdrop"><section class="modal"></section></div>');
 const padding=css(el.querySelector('.modal-backdrop')!,'padding',390,300);
 const height=css(el.querySelector('.modal')!,'max-height',390,300);
 assert.match(padding,/safe-area-inset-top/);assert.match(padding,/safe-area-inset-bottom/);
 assert.match(height,/--phone-viewport-height/);assert.match(height,/- max\(8px,env\(safe-area-inset-top\)\)/);assert.match(height,/- max\(8px,env\(safe-area-inset-bottom\)\)/);
 el.remove();
});
test('long authored 2.5D titles keep all text while the real cards permit wrapping at every phone width',async()=>{
 const {default:LayeredView}=await import('./LayeredView');const p=createTimelineDemo();const title='這是一個需要完整保留的長事件名稱'.repeat(4)+'LongUnbrokenTitle'.repeat(5);p.units.find(u=>u.id==='e1')!.title=title;
 render(<LayeredView project={p} cursor={{basis:'narrative',occurrenceId:'narrative-e1'}} onSelect={()=>{}}/>);
 const titles=[...document.querySelectorAll('.layered-view__rail button>b')].filter(n=>n.textContent===title);assert.ok(titles.length>=3);
 for(const width of [320,360,390,430])for(const title of titles){assert.equal(css(title.parentElement!,'white-space',width),'normal');assert.equal(css(title,'overflow-wrap',width),'anywhere');}
});
test('300-event numeric lanes preserve screen-size markers and exact point-to-target positions',()=>{
 const p=createTimelineDemo();while(p.timelines.narrative.placements.length<300)addOccurrence(p,'narrative','e1');const track=newContentTrack('narrative','emotion');track.meaning='作者設定的相對強度';track.entries=p.timelines.narrative.placements.slice(0,3).map((o,i)=>({id:`point-${i}`,anchor:contentAnchor('narrative',o),value:i*25,note:''}));saveContentTrack(p,track);editor.setState({project:p,trackingOwner:'all',trackingDimension:'all',hiddenContentTrackIds:[]});render(<StoryTrackRows p={p} basis="narrative" occurrenceId={p.timelines.narrative.placements[0].id}/>);
 const lane=document.querySelector('.content-number-lane')!;assert.ok(lane);
 assert.equal((lane.parentElement as HTMLElement).style.getPropertyValue('--content-lane-touch-width'),'13200px');
 const points=lane.querySelectorAll('[data-content-point]');assert.ok(points.length>0);
 for(const point of points){assert.equal(point.getAttribute('vector-effect'),'non-scaling-stroke');assert.equal(point.getAttribute('stroke-linecap'),'round');assert.ok(Number(point.getAttribute('stroke-width'))<=8);const id=point.getAttribute('data-content-point');const at=p.timelines.narrative.placements.findIndex(o=>o.id===id);assert.equal(Number(point.getAttribute('x1')),(at+.5)*600/300);assert.equal(point.getAttribute('x1'),point.getAttribute('x2'));}
 for(const segment of lane.querySelectorAll('[data-content-segment]'))assert.equal(segment.getAttribute('vector-effect'),'non-scaling-stroke');
});
