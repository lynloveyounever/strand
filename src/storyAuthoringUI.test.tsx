import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://strand.test' });
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,confirm:()=>true,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const {render,fireEvent,screen,cleanup,act,within}=await import('@testing-library/react');
const {default:App}=await import('./App');
const {default:StoryAuthoring}=await import('./StoryAuthoring');
const {editor,saveNow,readSavedProject,STORAGE_KEY}=await import('./store');
const {createBlankProject,clone,parseProject,reviewStage,approveStage}=await import('./model');
const {createSample}=await import('./sample');
const {addStoryUnit,addStoryCharacter}=await import('./storyAuthoring');
const {addOccurrence}=await import('./temporal');
function reset(p=createBlankProject()) { act(()=>editor.setState({project:p,past:[],future:[],selectedId:p.units[0].id,occurrenceId:p.timelines.reality.placements[0].id,basis:'reality',playhead:.5,trackId:'author',outlineOpen:false,inspectorOpen:false,notice:''})); }
function show(){render(<StoryAuthoring onNew={()=>reset()} onRead={()=>{}} onArrange={()=>{}} onAdvanced={()=>{}}/>);}
function write(label:string,value:string){const field=screen.getByLabelText(label);fireEvent.focus(field);fireEvent.change(field,{target:{value}});fireEvent.blur(field);}
function open(selector:string){act(()=>{document.querySelector<HTMLDetailsElement>(selector)!.open=true;});}
beforeEach(()=>{reset();localStorage.clear();});afterEach(()=>cleanup());
test('new story launches on only the three core visible fields and blank optional fields are collapsed',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));
 assert.ok(screen.getByRole('region',{name:'Story blueprint authoring'}));
 assert.deepEqual(screen.getAllByRole('textbox').filter(e=>!e.closest('details:not([open])')).map(e=>e.getAttribute('placeholder')),['誰做了什麼？先寫能讀懂的事件，不用填滿其他欄位','是什麼讓這件事發生？暫時不知道也可以','事情、人物或關係因此有什麼改變？']);
 assert.equal(document.querySelector<HTMLDetailsElement>('.author-scene-craft')!.open,false);assert.equal(editor.getState().project.tracks.length,0);assert.equal(editor.getState().project.units.length,5);
});
test('three-field writing saves, reopens and survives JSON import and undo as a coherent minimal story',()=>{
 show();write('發生什麼','他用謊言拖住對方');write('為什麼發生','他需要時間保護家人');write('造成什麼結果','對方發現真相，因此不再信任他');
 act(()=>saveNow());const saved=readSavedProject(localStorage).project; assert.equal(saved.units[4].summary,'他用謊言拖住對方');assert.equal(saved.units[4].storyLogic?.outcome,'對方發現真相，因此不再信任他');
 fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));assert.match(screen.getByRole('article',{name:'Readable story blueprint'}).textContent!,/他用謊言拖住對方/);
 act(()=>editor.getState().importProject(parseProject(JSON.stringify(saved))));act(()=>editor.getState().undo());assert.equal(editor.getState().project.units[4].summary,'他用謊言拖住對方');
});
test('optional scene craft edits the existing goal and outcome; all guidance can remain blank',()=>{
 show();open('.author-scene-craft');write('這一場想達成什麼','拖延出發');write('對抗或阻力','對方堅持立刻離開');write('轉折或改變','謊言被識破');write('離開這一場時的結果','關係破裂');
 const scene=editor.getState().project.units.find(u=>u.kind==='scene')!;assert.equal(scene.intent,'拖延出發');assert.equal(scene.storyLogic?.outcome,'關係破裂');assert.deepEqual(scene.craft,{opposition:'對方堅持立刻離開',turn:'謊言被識破'});
 act(()=>editor.getState().undo());assert.equal(editor.getState().project.units.find(u=>u.kind==='scene')!.storyLogic,undefined);
});
test('adding events and scenes keeps exact selection; handoff reads the selected event, not the old cursor',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));write('發生什麼','第一件事');fireEvent.click(screen.getByRole('button',{name:'＋ 此場事件'}));write('發生什麼','第二件事');
 const selected=editor.getState().selectedId;assert.equal(editor.getState().project.timelines.reality.placements.find(o=>o.id===editor.getState().occurrenceId)?.eventId,selected);
 fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));fireEvent.click(screen.getByRole('button',{name:'逐步讀懂故事'}));assert.match(screen.getByRole('article',{name:'Readable selected event'}).textContent!,/第二件事/);
 fireEvent.click(screen.getByRole('button',{name:'Build story blueprint'}));fireEvent.click(screen.getByRole('button',{name:'＋ 場'}));assert.equal(editor.getState().project.units.filter(u=>u.kind==='scene').length,2);assert.equal(editor.getState().project.units.filter(u=>u.kind==='beat').length,3);
});
test('a focused draft cannot leak into a same-ID import or undo replacement',()=>{
 show();const field=screen.getByLabelText('發生什麼');fireEvent.focus(field);fireEvent.change(field,{target:{value:'不該穿越的草稿'}});
 const replacement=createBlankProject();replacement.units[4].summary='另一個作品';act(()=>editor.getState().importProject(replacement));fireEvent.blur(screen.getByLabelText('發生什麼'));assert.equal(editor.getState().project.units[4].summary,'另一個作品');
 fireEvent.change(screen.getByLabelText('發生什麼'),{target:{value:'未儲存'}});act(()=>editor.getState().undo());fireEvent.blur(screen.getByLabelText('發生什麼'));assert.equal(editor.getState().project.units[4].summary,'');
});
test('character choice, theme and after-state stay linked to the selected event without blank tracks crowding it',()=>{
 show();open('.author-inline-logic');assert.equal(document.querySelectorAll('.author-impact-summary>button').length,0);open('.author-character');
 fireEvent.change(screen.getByLabelText('新增人物名稱'),{target:{value:'阿明'}});fireEvent.click(screen.getByRole('button',{name:'加入人物'}));write('他做了什麼選擇／反應','他撒謊讓對方留下');
 const nested=[...document.querySelectorAll<HTMLDetailsElement>('.author-character details')];act(()=>nested.forEach(d=>d.open=true));write('之後的狀態或關係','被對方懷疑');write('主題問題','保護能否正當化隱瞞？');write('這次選擇如何回應、挑戰或複雜化這個問題','他的保護剝奪了對方選擇');
 assert.equal(editor.getState().project.transitions[0].reaction,'他撒謊讓對方留下');assert.equal(editor.getState().project.transitions[0].after.state,'被對方懷疑');assert.equal(editor.getState().project.transitions[0].themeLink,'他的保護剝奪了對方選擇');
 assert.match(document.querySelector('.author-impact-summary')!.textContent!,/被對方懷疑/);
});
test('same event repeated audience nodes edit independently and preserve empty cognition explicitly',()=>{
 const p=createBlankProject();addOccurrence(p,'audience','new-beat');reset(p);show();open('.author-inline-logic');open('.author-audience-effects');act(()=>document.querySelectorAll<HTMLDetailsElement>('.author-audience-link details').forEach(d=>d.open=true));
 write('節點 1 · 觀眾知道什麼','他正在說謊');write('節點 2 · 觀眾相信什麼','他試圖保護家人');write('節點 1 · 觀眾知道什麼','');
 const [a,b]=editor.getState().project.timelines.audience.placements;assert.equal(a.audienceDesign?.cognition.knows,'');assert.equal(b.audienceDesign?.cognition.believes,'他試圖保護家人');assert.equal(b.audienceDesign?.cognition.knows,'');
 fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));assert.match(screen.getByRole('article',{name:'Readable story blueprint'}).textContent!,/他試圖保護家人/);
});
test('legacy audience text is shown as authored while explicit modern blanks stay empty',()=>{
 const p=createSample();const o=p.timelines.audience.placements[0];o.knowledgeNote='';o.updates=[{trackId:'audience',interpretation:'舊的相信',reaction:'',after:{state:'',knowledge:'舊的知道',goal:'',obstacle:'',motivation:''}}];delete o.audienceDesign;reset(p);show();open('.author-inline-logic');open('.author-audience-effects');assert.match(document.querySelector('.author-audience-effects')!.textContent!,/舊的知道/);
 act(()=>document.querySelectorAll<HTMLDetailsElement>('.author-audience-link details').forEach(d=>d.open=true));write('節點 1 · 觀眾知道什麼','');assert.equal(editor.getState().project.timelines.audience.placements[0].audienceDesign?.cognition.believes,'舊的相信');assert.doesNotMatch(document.querySelector('.author-audience-link')!.textContent!,/舊的知道/);
});
test('local blueprint approval captures character context and preserves its immutable history after later edits',()=>{
 show();write('發生什麼','他作出選擇');fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));act(()=>{document.querySelector<HTMLDetailsElement>('.author-next details')!.open=true;});fireEvent.click(screen.getByRole('button',{name:'標記待審閱'}));fireEvent.click(screen.getByRole('button',{name:'確認並保留快照'}));const snapshot=editor.getState().project.units[0].stages.blueprint.approvals[0].snapshot;
 fireEvent.click(screen.getByRole('button',{name:/02場與事件/}));write('造成什麼結果','他失去信任');assert.equal(editor.getState().project.units[0].stages.blueprint.status,'draft');assert.equal(editor.getState().project.units[0].stages.blueprint.approvals[0].snapshot,snapshot);assert.ok(Array.isArray(JSON.parse(snapshot).perspectives));
});
test('read-only fictional preview leaves an authored story and all new fields untouched',()=>{
 const p=createBlankProject();p.premise='我的故事';p.themeQuestion='我的问题';reset(p);const before=clone(p);render(<App/>);fireEvent.click(screen.getByRole('button',{name:'閱讀完整示例'}));assert.deepEqual(editor.getState().project,before);fireEvent.click(screen.getByRole('button',{name:'回到我的作品'}));assert.deepEqual(editor.getState().project,before);
});

test('existing exact Narrative repeat survives authoring and reader handoff',()=>{
 const p=createSample();const repeated=addOccurrence(p,'narrative','e1');reset(p);act(()=>editor.setState({basis:'narrative',occurrenceId:repeated,selectedId:'e1',playhead:p.timelines.narrative.placements.length-.5}));
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Build story blueprint'}));fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));fireEvent.click(screen.getByRole('button',{name:'逐步讀懂故事'}));assert.equal(editor.getState().basis,'narrative');assert.equal(editor.getState().occurrenceId,repeated);
});
test('generic audience handoff opens explicit mapped-node choices without an arbitrary selection',()=>{
 const p=createBlankProject();addOccurrence(p,'audience','new-beat');reset(p);const before=editor.getState().occurrenceId;show();fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));fireEvent.click(screen.getByRole('button',{name:'觀眾理解'}));assert.equal(editor.getState().occurrenceId,before);assert.equal(document.querySelector<HTMLDetailsElement>('.author-audience-effects')!.open,true);assert.equal(document.querySelectorAll('.author-audience-link').length,2);
});

test('focused event text commits before pagehide saves the project',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));const field=screen.getByLabelText('發生什麼');act(()=>field.focus());fireEvent.change(field,{target:{value:'離開前最後寫下的事件'}});
 act(()=>window.dispatchEvent(new window.Event('pagehide')));assert.equal(readSavedProject(localStorage).project.units[4].summary,'離開前最後寫下的事件');
});
test('backgrounding saves a focused outcome without a separate click',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));const field=screen.getByLabelText('造成什麼結果');act(()=>field.focus());fireEvent.change(field,{target:{value:'關係因此改變'}});
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});act(()=>document.dispatchEvent(new window.Event('visibilitychange')));assert.equal(readSavedProject(localStorage).project.units[4].storyLogic?.outcome,'關係因此改變');Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
});

test('canceling new-story creation preserves the current authoring step and project',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Build story blueprint'}));fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));const before=clone(editor.getState().project);Object.defineProperty(globalThis,'confirm',{value:()=>false,configurable:true});fireEvent.click(screen.getByRole('button',{name:'建立新故事'}));assert.ok(screen.getByRole('article',{name:'Readable story blueprint'}));assert.deepEqual(editor.getState().project,before);Object.defineProperty(globalThis,'confirm',{value:()=>true,configurable:true});
});

test('legacy perspective editing and deletion reopen the blueprint and preserve its approved snapshot',()=>{
 const p=createBlankProject();const id=addStoryCharacter(p,'原人物');reviewStage(p,'new-story','blueprint');approveStage(p,'new-story','blueprint');const frozen=p.units[0].stages.blueprint.approvals[0].snapshot;reset(p);render(<App/>);act(()=>editor.setState({trackId:id,panel:'track',inspectorOpen:true}));
 const name=screen.getByLabelText('Name');fireEvent.change(name,{target:{value:'新名字'}});fireEvent.blur(name);assert.equal(editor.getState().project.units[0].stages.blueprint.status,'draft');
 act(()=>editor.getState().transact(next=>{reviewStage(next,'new-story','blueprint');approveStage(next,'new-story','blueprint');}));fireEvent.click(screen.getByRole('button',{name:'Delete perspective track'}));assert.equal(editor.getState().project.units[0].stages.blueprint.status,'draft');assert.equal(editor.getState().project.tracks.length,0);assert.equal(editor.getState().project.units[0].stages.blueprint.approvals[0].snapshot,frozen);
});
