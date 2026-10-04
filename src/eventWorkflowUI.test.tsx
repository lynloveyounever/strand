import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://strand-workflow.test' });
for (const [key,value] of Object.entries({ window:dom.window, document:dom.window.document, navigator:dom.window.navigator, localStorage:dom.window.localStorage, HTMLElement:dom.window.HTMLElement, confirm:()=>true, IS_REACT_ACT_ENVIRONMENT:true })) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const {render,fireEvent,screen,cleanup,act,within} = await import('@testing-library/react');
const {default:StoryAuthoring} = await import('./StoryAuthoring');
const {editor,makeStore,saveNow,readSavedProject} = await import('./store');
const {createBlankProject,parseProject,clone} = await import('./model');
const {addStoryUnit,addStoryCharacter,editCharacterOpening} = await import('./storyAuthoring');
const {addOccurrence,removeOccurrence} = await import('./temporal');
const {editInlineAudience} = await import('./eventWorkflow');
const {default:StoryReader} = await import('./StoryReader');
function reset(p=createBlankProject()) { const {set,transact,undo,redo,importProject,...state}=makeStore(p).getState(); act(()=>editor.setState(state)); }
function write(label:string,value:string){const field=screen.getByLabelText(label);fireEvent.focus(field);fireEvent.change(field,{target:{value}});fireEvent.blur(field);}
function open(selector:string) { act(()=>{ document.querySelectorAll<HTMLDetailsElement>(selector).forEach(d=>d.open=true); }); }
function show(mobile=false){render(<StoryAuthoring mobile={mobile} onNew={()=>false} onRead={()=>{}} onArrange={()=>{throw new Error('Flow must stay inline');}} onAdvanced={()=>{throw new Error('Flow must stay inline');}}/>);}
beforeEach(()=>{localStorage.clear();reset();});afterEach(()=>cleanup());
for (const mobile of [false,true]) test(`new two-plot story completes create/edit/order/save/export with inline checks (${mobile?'phone':'desktop'} DOM)`, async()=>{
 Object.defineProperty(window,'innerWidth',{configurable:true,value:mobile?320:1440});show(mobile);
 assert.equal(screen.getByLabelText('發生什麼').getAttribute('required'),'');
 assert.equal(screen.getByLabelText('為什麼發生').getAttribute('required'),null);
 write('發生什麼','林找到被撕毀的信');write('造成什麼結果','她決定尋找失蹤的朋友');
 open('.event-plot-editor');fireEvent.change(screen.getByLabelText('新增故事線名稱'),{target:{value:'尋人'}});fireEvent.click(screen.getByRole('button',{name:'建立並加入此事件'}));
 fireEvent.click(screen.getByRole('button',{name:'＋ 此場事件'}));const second=editor.getState().selectedId;
 write('發生什麼','林隱瞞找到信的事');write('為什麼發生','她害怕朋友因此受傷');write('造成什麼結果','同伴不再信任她');
 open('.author-causal-source');fireEvent.change(screen.getByLabelText('原因承接哪個事件（選填）'),{target:{value:'new-beat'}});
 open('.event-plot-editor');fireEvent.click(screen.getByLabelText('尋人'));fireEvent.change(screen.getByLabelText('新增故事線名稱'),{target:{value:'重建信任'}});fireEvent.click(screen.getByRole('button',{name:'建立並加入此事件'}));
 assert.equal(editor.getState().project.narrativeLines?.filter(l=>l.eventIds.includes(second)).length,2);
 assert.equal(document.querySelector('.author-outline li[data-event-relation=cause]')?.getAttribute('data-event-relation'),'cause');
 open('.author-inline-logic,.author-character');fireEvent.change(screen.getByLabelText('新增人物名稱'),{target:{value:'林'}});fireEvent.click(screen.getByRole('button',{name:'加入人物'}));open('.author-character details');write('推動他的需要','保護朋友');write('他做了什麼選擇／反應','她把信藏起來');write('之後知道的事','朋友仍活著');write('之後想要的事','先找到朋友');
 fireEvent.click(screen.getByLabelText(/這個選擇明確依賴事件前的動機/));
 const comparison=screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'});assert.match(comparison.textContent!,/朋友仍活著/);assert.match(comparison.textContent!,/先找到朋友/);
 write('推動他的需要','');assert.match(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/選擇缺少已指定的動機/);write('推動他的需要','保護朋友');
 open('.author-audience-effects,.author-audience-link details');write('節點 2 · 觀眾知道什麼','林正在保護朋友');
 fireEvent.click(screen.getByLabelText('節點 1 · 事件 1'));fireEvent.click(screen.getByRole('button',{name:'加入期待'}));fireEvent.change(screen.getByLabelText('節點 2 期待 1'),{target:{value:'同伴會發現信嗎？'}});fireEvent.change(screen.getByLabelText('節點 2 tension'),{target:{value:'0'}});
 const narrative=clone(editor.getState().project.timelines.narrative),world=clone(editor.getState().project.timelines.reality);
 fireEvent.click(screen.getByRole('button',{name:'理解節點 2 提前'}));assert.match(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/理解依據尚未出現/);assert.match(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/上一步修改的影響/);assert.deepEqual(editor.getState().project.timelines.narrative,narrative);assert.deepEqual(editor.getState().project.timelines.reality,world);
 act(()=>editor.getState().undo());assert.doesNotMatch(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/理解依據尚未出現/);act(()=>editor.getState().redo());
 assert.equal(editor.getState().project.timelines.audience.placements[0].audienceDesign?.emotions.tension,0);
 act(()=>saveNow());const saved=readSavedProject(localStorage).project;assert.equal(saved.transitions[0].motivationSource?.eventId,null);
 const blobs:Blob[]=[];const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=dom.window.HTMLAnchorElement.prototype.click;URL.createObjectURL=(b)=>{blobs.push(b as Blob);return 'blob:test';};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=()=>{};
 try {fireEvent.click(screen.getByRole('button',{name:/04閱讀藍圖/}));fireEvent.click(screen.getByRole('button',{name:'匯出可讀藍圖 .txt'}));fireEvent.click(screen.getByRole('button',{name:'備份全部資料 .json'}));const text=await blobs[0].text();assert.match(text,/尋人／重建信任/);assert.match(text,/同伴會發現信嗎/);assert.match(text,/選擇明確依賴的動機來源/);const backup=parseProject(await blobs[1].text());assert.deepEqual(backup,editor.getState().project);act(()=>editor.getState().importProject(backup));assert.deepEqual(editor.getState().project,saved);} finally {URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.HTMLAnchorElement.prototype.click=oldClick;}
});
test('repeated audience occurrences retain exact requirements and deleted sources remain removable inline',()=>{
 const p=createBlankProject(),repeat=addOccurrence(p,'audience','new-beat'),first=p.timelines.audience.placements[0].id;editInlineAudience(p,repeat,d=>{d.requiredEarlierIds=[first];d.cognition.knows='第二次揭露';});removeOccurrence(p,'audience',first);reset(p);show();open('.author-inline-logic,.author-audience-effects,.author-audience-link details');assert.match(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/已移除的節點/);fireEvent.click(screen.getByLabelText('來源已刪除 · 取消勾選以解除'));assert.deepEqual(editor.getState().project.timelines.audience.placements[0].audienceDesign?.requiredEarlierIds,[]);assert.equal(editor.getState().project.timelines.audience.placements[0].id,repeat);
});
test('inline expansion stays on selected event and changing event commits a focused draft',()=>{
 const p=createBlankProject();addStoryUnit(p,'new-scene','beat');reset(p);show(true);open('.author-inline-logic');assert.equal(screen.getByRole('button',{name:/02場與事件/}).getAttribute('aria-pressed'),'true');const field=screen.getByLabelText('發生什麼');field.focus();fireEvent.change(field,{target:{value:'保留焦點中的內容'}});fireEvent.click(screen.getByRole('button',{name:'下一事件'}));assert.equal(editor.getState().project.units.find(u=>u.id==='new-beat')?.summary,'保留焦點中的內容');assert.match(document.querySelector('.event-focus-position')!.textContent!,/故事位置 2 \/ 2/);assert.equal((screen.getByLabelText('發生什麼') as HTMLTextAreaElement).value,'');
});
test('reader preview cannot mutate working project through new relationship and comparison surfaces',()=>{
 const p=createBlankProject();const c=addStoryCharacter(p,'林');editCharacterOpening(p,c,{goal:'找人'});reset(p);render(<StoryReader mobile={false} onArrange={()=>{}} onAdvanced={()=>{}}/>);const before=clone(editor.getState().project);fireEvent.click(screen.getByRole('button',{name:'閱讀完整示例'}));open('.reader-event-context');const links=screen.getByRole('region',{name:'此事件的明確因果連結'});const go=within(links).queryAllByRole('button')[0];if(go)fireEvent.click(go);assert.deepEqual(editor.getState().project,before);assert.equal(editor.getState().past.length,0);
});
test('saved motivation provenance remains visible after world reorder and empty choices can unlink', async()=>{
 const {editReadingCharacter}=await import('./storyReading');const {setMotivationDependency}=await import('./eventWorkflow');const {moveOccurrences}=await import('./temporal');
 const p=createBlankProject(),second=addStoryUnit(p,'new-scene','beat'),c=addStoryCharacter(p,'林');editCharacterOpening(p,c,{motivation:'開場動機'});editReadingCharacter(p,'new-beat',c,'reaction','第一次行動');editReadingCharacter(p,second,c,'reaction','第二次行動');setMotivationDependency(p,second,c,true);moveOccurrences(p,'reality',[p.timelines.reality.placements[1].id],p.timelines.reality.placements[0].id);reset(p);act(()=>editor.setState({selectedId:second,occurrenceId:p.timelines.reality.placements.find(o=>o.eventId===second)!.id}));show();open('.author-inline-logic,.author-character');assert.match(document.querySelector('.event-motivation-link')!.textContent!,/已指定來源：〈事件 1〉/);assert.match(document.querySelector('.event-motivation-link')!.textContent!,/目前世界前項不同/);write('他做了什麼選擇／反應','');const checkbox=screen.getByLabelText(/這個選擇明確依賴事件前的動機/);assert.equal((checkbox as HTMLInputElement).disabled,false);fireEvent.click(checkbox);assert.equal(editor.getState().project.transitions.find(t=>t.eventId===second)?.motivationSource,undefined);
});
test('canonical character content stays visible when world timing is ambiguous or event is unmapped', async()=>{
 const {editCharacterEffect}=await import('./storyAuthoring');const {EventSituation}=await import('./EventFocus');const p=createBlankProject(),second=addStoryUnit(p,'new-scene','beat'),c=addStoryCharacter(p,'林');editCharacterEffect(p,'new-beat',c,'knowledge','Secret A');editCharacterEffect(p,second,c,'knowledge','Secret B');p.realityTiming={mode:'relations',relations:[{id:'same',kind:'same-time',fromEventId:'new-beat',toEventId:second,note:''}]};const event=p.units.find(u=>u.id==='new-beat')!;const {rerender}=render(<EventSituation project={p} event={event}/>);assert.match(screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'}).textContent!,/Secret A/);assert.match(screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'}).textContent!,/世界承接未定或同時設定衝突/);const next=clone(p);removeOccurrence(next,'reality',next.timelines.reality.placements.find(o=>o.eventId===event.id)!.id);rerender(<EventSituation project={next} event={event}/>);assert.match(screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'}).textContent!,/Secret A/);assert.match(screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'}).textContent!,/未映射世界順序/);assert.doesNotMatch(screen.getByRole('region',{name:'同一事件的世界人物觀眾對照'}).textContent!,/此事件尚未連結人物/);
});
test('expectation responses can be set inline and a reversed response reports the reset',()=>{
 const p=createBlankProject();addStoryUnit(p,'new-scene','beat');reset(p);show();open('.author-inline-logic,.author-audience-effects,.author-audience-link details');fireEvent.click(screen.getByRole('button',{name:'加入期待'}));fireEvent.change(screen.getByLabelText('節點 1 期待 1'),{target:{value:'他會回來'}});const target=editor.getState().project.timelines.audience.placements[1].id;fireEvent.change(screen.getByLabelText('節點 1 期待 1 回應位置'),{target:{value:target}});fireEvent.change(screen.getByLabelText('節點 1 期待 1 回應方式'),{target:{value:'subverted'}});assert.equal(editor.getState().project.timelines.audience.placements[0].audienceDesign?.expectations[0].response,'subverted');fireEvent.click(screen.getByRole('button',{name:'理解節點 1 延後'}));assert.match(screen.getByRole('region',{name:'可追溯的故事檢查'}).textContent!,/回應位置已失效/);assert.equal(editor.getState().project.timelines.audience.placements[1].audienceDesign?.expectations[0].response,'open');
});
