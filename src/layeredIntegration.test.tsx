import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://local.test' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'localStorage'] as const) Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { render, fireEvent, screen, cleanup, act } = await import('@testing-library/react');
const { default: TimelineNavigator } = await import('./TimelineNavigator');
const { editor } = await import('./store');
const { createTimelineDemo } = await import('./sample');
const { moveOccurrences, removeOccurrence } = await import('./temporal');
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  editor.setState({ project:createTimelineDemo(), past:[], future:[], selectedId:'e1', basis:'narrative', occurrenceId:'narrative-e1', playhead:1.5, trackId:'lin', lineId:'', contentTrackId:'', trackingOwner:'all', trackingDimension:'all', hiddenContentTrackIds:[], zoom:87, panel:'cursor', outlineOpen:false, inspectorOpen:false, notice:'' });
});
afterEach(() => cleanup());
const layeredCard = (id: string) => document.querySelector<HTMLButtonElement>(`[data-layered-occurrence="${id}"]`)!;
const navigator = () => screen.getByRole('region', { name:'三線總覽與播放' });
function openLayered() { fireEvent.click(screen.getByRole('button', { name:'顯示2.5D分層對照' })); }
function mount() { render(<TimelineNavigator onFlat={() => {}}/>); }

test('integrated 2.5D and 3D stay optional and can be compared without replacing either', () => {
  mount(); const before = JSON.stringify(editor.getState().project);
  assert.equal(screen.getByRole('button', {name:'顯示2.5D分層對照'}).getAttribute('aria-expanded'), 'false');
  assert.equal(screen.getByRole('button', {name:'顯示空間投影'}).getAttribute('aria-expanded'), 'false');
  assert.equal(screen.queryByRole('region', { name:'2.5D 分層對照' }), null);
  assert.equal(screen.queryByRole('region', { name:'Holographic narrative viewer' }), null);
  openLayered(); assert.ok(screen.getByRole('region', { name:'2.5D 分層對照' }));
  fireEvent.click(screen.getByRole('button', {name:'顯示空間投影'}));
  assert.ok(screen.getByRole('region', {name:'Holographic narrative viewer'}));
  const surface = document.querySelector<HTMLElement>('.holo-surface')!, map = surface.querySelector('svg')!;
  fireEvent.keyDown(map, {key:'ArrowRight'}); const yaw = surface.dataset.cameraYaw;
  openLayered(); assert.equal(screen.queryByRole('region', {name:'2.5D 分層對照'}), null);
  assert.ok(screen.getByRole('region', {name:'Holographic narrative viewer'}));
  openLayered(); assert.equal(surface.dataset.cameraYaw, yaw);
  assert.equal(JSON.stringify(editor.getState().project), before); assert.equal(editor.getState().past.length, 0);
});
test('2.5D enters the exact repeated presentation and Back restores focus, scroll, reference and spacing', () => {
  mount(); openLayered();
  const before = JSON.stringify(editor.getState().project), initial = editor.getState();
  fireEvent.change(screen.getByLabelText('呈現步序'), {target:{value:'5'}});
  fireEvent.click(screen.getByRole('button', {name:'緊密'}));
  const card = layeredCard('narrative-e9'), rail = card.closest<HTMLElement>('.layered-view__rail')!;
  navigator().scrollTop = 212; rail.scrollLeft = 1400;
  act(() => card.focus()); assert.equal(navigator().dataset.previewing, 'true');
  fireEvent.click(card);
  assert.equal(editor.getState().occurrenceId, 'narrative-e9'); assert.equal(editor.getState().selectedId, 'e9');
  assert.equal(document.querySelector('[data-focus-occurrence="narrative-e9"]')!.getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[data-focus-occurrence="narrative-opening"]')!.getAttribute('aria-pressed'), 'false');
  assert.equal(screen.queryByRole('region', {name:'2.5D 分層對照'}), null);
  fireEvent.click(screen.getByRole('button', {name:'← 回到三線總覽'}));
  assert.equal(editor.getState().occurrenceId, initial.occurrenceId); assert.equal(editor.getState().playhead, initial.playhead);
  assert.equal(editor.getState().trackId, initial.trackId);
  assert.equal(document.activeElement?.getAttribute('data-layered-occurrence'), 'narrative-e9');
  assert.equal(navigator().dataset.previewing, 'false'); assert.equal(document.querySelector('[data-layered-preview=true]'), null);
  assert.equal(navigator().scrollTop, 212); assert.equal(rail.scrollLeft, 1400);
  assert.equal((screen.getByLabelText('呈現步序') as HTMLInputElement).value, '5');
  assert.equal(screen.getByRole('region', {name:'2.5D 分層對照'}).getAttribute('data-layer-spacing'), 'compact');
  assert.equal(JSON.stringify(editor.getState().project), before); assert.equal(editor.getState().past.length, 0);
});
test('phone tap of a repeated Audience occurrence and Escape preserve exact return context', () => {
  Object.defineProperty(window, 'innerWidth', { value:390, configurable:true }); mount(); openLayered();
  const before = JSON.stringify(editor.getState().project), card = layeredCard('audience-disclosure-3');
  fireEvent.click(card);
  assert.equal(editor.getState().basis, 'audience'); assert.equal(editor.getState().occurrenceId, 'audience-disclosure-3');
  assert.ok(document.querySelectorAll('[data-focus-emotion-segment]').length > 0);
  fireEvent.keyDown(screen.getByRole('region', {name:'單線閱讀細節'}), {key:'Escape'});
  assert.equal(editor.getState().occurrenceId, 'narrative-e1');
  assert.equal(document.activeElement?.getAttribute('data-layered-occurrence'), 'audience-disclosure-3');
  assert.equal(navigator().dataset.previewing, 'false');
  assert.equal(JSON.stringify(editor.getState().project), before);
});
test('integrated preview is read-only and keeps playback reference distinct from inspection selection', () => {
  mount(); openLayered(); const before = JSON.stringify(editor.getState());
  const card = layeredCard('audience-disclosure-3'); act(() => card.focus());
  assert.equal(navigator().dataset.previewing, 'true');
  assert.equal(document.querySelector('[data-layered-reference=true]')!.getAttribute('data-layered-occurrence'), 'narrative-e1');
  assert.equal(document.querySelector('[data-layered-exact=true]')!.getAttribute('data-layered-occurrence'), 'audience-disclosure-3');
  assert.equal(JSON.stringify(editor.getState()), before);
  fireEvent.keyDown(card, {key:'Escape'});
  assert.equal(navigator().dataset.previewing, 'false'); assert.equal(JSON.stringify(editor.getState()), before);
  assert.equal(document.querySelector('[data-layered-exact=true]')!.getAttribute('data-layered-occurrence'), 'narrative-e1');
});
test('project reorders keep exact focused and return occurrences while retaining the user edit', () => {
  mount(); openLayered(); fireEvent.click(layeredCard('narrative-e9'));
  act(() => editor.getState().transact(p => moveOccurrences(p, 'narrative', ['narrative-e9'], 'narrative-e3')));
  let state = editor.getState();
  assert.equal(state.occurrenceId, 'narrative-e9');
  assert.equal(state.playhead, state.project.timelines.narrative.placements.findIndex(o => o.id === 'narrative-e9') + .5);
  act(() => editor.getState().transact(p => moveOccurrences(p, 'narrative', ['narrative-e1'], 'narrative-e6')));
  const index = editor.getState().project.timelines.narrative.placements.findIndex(o => o.id === 'narrative-e1');
  fireEvent.click(screen.getByRole('button', {name:'← 回到三線總覽'}));
  state = editor.getState(); assert.equal(state.occurrenceId, 'narrative-e1'); assert.equal(state.playhead, index + .5);
  assert.equal(state.past.length, 2); assert.equal(navigator().dataset.previewing, 'false');
  assert.equal(document.activeElement?.getAttribute('data-layered-occurrence'), 'narrative-e9');
});
test('deleting the focused layered occurrence returns to the still-open overview with an explicit notice', () => {
  mount(); openLayered(); fireEvent.click(layeredCard('narrative-e9'));
  act(() => editor.getState().transact(p => removeOccurrence(p, 'narrative', 'narrative-e9')));
  assert.equal(screen.queryByRole('region', {name:'單線閱讀細節'}), null);
  assert.ok(screen.getByRole('region', {name:'2.5D 分層對照'}));
  assert.equal(document.querySelector('[data-layered-occurrence=narrative-e9]'), null);
  assert.match(document.querySelector('.navigator-overview')!.textContent!, /正在閱讀的節點已移除/);
  assert.equal(editor.getState().past.length, 1); assert.equal(navigator().dataset.previewing, 'false');
});
test('editing from the chosen 2.5D detail keeps that exact occurrence and shared inspector context', () => {
  mount(); openLayered(); const before = JSON.stringify(editor.getState().project);
  fireEvent.click(layeredCard('audience-disclosure-3'));
  fireEvent.click(screen.getByRole('button', {name:'編輯目前單線節點'}));
  const state = editor.getState();
  assert.equal(state.basis, 'audience'); assert.equal(state.occurrenceId, 'audience-disclosure-3'); assert.equal(state.selectedId, 'e1');
  assert.equal(state.inspectorOpen, true); assert.equal(state.panel, 'compare');
  assert.ok(screen.getByRole('region', {name:'單線閱讀細節'}));
  assert.equal(JSON.stringify(state.project), before); assert.equal(state.past.length, 0);
});
