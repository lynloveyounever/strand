import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://local.test' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, confirm: () => true, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
const { render, fireEvent, screen, cleanup, act, within } = await import('@testing-library/react');
const { default: App } = await import('./App');
const { default: StoryTracksPanel, StoryTrackControls, StoryTrackRows } = await import('./StoryTracks');
const { default: RealityTimingEditor } = await import('./RealityTiming');
const { editor, makeStore, saveNow, STORAGE_KEY } = await import('./store');
const { createSample, createTimelineDemo } = await import('./sample');
const { clone, children } = await import('./model');
const { newContentTrack, saveContentTrack, setContentEntry, contentAnchor, ownerKey, removeContentTrack } = await import('./storyTracks');
beforeEach(() => { const { set, transact, undo, redo, importProject, ...state } = makeStore(createSample()).getState(); editor.setState(state); localStorage.clear(); });
afterEach(() => cleanup());
function presetTrack() { const p = createSample(), t = newContentTrack('narrative'); t.id = 'ui-track'; t.name = '自己命名'; saveContentTrack(p, t); editor.setState({ project: p, contentTrackId: t.id, selectedId: 'e1', occurrenceId: 'narrative-e1', basis: 'narrative' }); return t; }
function compareApp() { render(<App/>); fireEvent.click(screen.getByRole('button', { name: 'Timeline workbench' })); }
test('full manual track authoring edits name, categorical value, unknown, removal and undo', () => {
  render(<StoryTracksPanel/>); fireEvent.click(screen.getByRole('button', { name: 'Create content track' }));
  fireEvent.change(screen.getByLabelText('Content track name'), { target: { value: '我的成長定義' } });
  fireEvent.change(screen.getByLabelText('Content track dimension'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Content time basis'), { target: { value: 'narrative' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Content track definition' }));
  const id = editor.getState().contentTrackId; assert.equal(editor.getState().project.storyTracks![0].name, '我的成長定義');
  fireEvent.change(screen.getByLabelText('Content point value'), { target: { value: '先求證，再決定' } }); fireEvent.submit(screen.getByRole('form', { name: 'Content point editor' }));
  assert.equal(editor.getState().project.storyTracks![0].entries[0].value, '先求證，再決定');
  fireEvent.click(screen.getByLabelText('Content point unknown')); fireEvent.submit(screen.getByRole('form', { name: 'Content point editor' })); assert.equal(editor.getState().project.storyTracks![0].entries[0].value, null);
  fireEvent.click(screen.getByRole('button', { name: '移除此更新' })); assert.equal(editor.getState().project.storyTracks![0].entries.length, 0);
  act(() => editor.getState().undo()); assert.equal(editor.getState().project.storyTracks![0].id, id); assert.equal(editor.getState().project.storyTracks![0].entries[0].value, null);
});
test('optional observer target and epistemic metadata can be authored in the same inspector', () => {
  render(<StoryTracksPanel/>); fireEvent.click(screen.getByRole('button', { name: 'Create content track' })); fireEvent.change(screen.getByLabelText('Content owner type'), { target: { value: 'audience' } }); fireEvent.change(screen.getByLabelText('Content target character'), { target: { value: 'lin' } }); fireEvent.change(screen.getByLabelText('Content epistemic status'), { target: { value: 'audience-belief' } }); fireEvent.change(screen.getByLabelText('Content track dimension'), { target: { value: 'judgment' } }); fireEvent.submit(screen.getByRole('form', { name: 'Content track definition' })); const t = editor.getState().project.storyTracks![0]; assert.equal(t.owner.kind, 'audience'); assert.equal(t.targetTrackId, 'lin'); assert.equal(t.epistemic, 'audience-belief'); assert.deepEqual(t.entries, []);
});
test('explicit clue links pick exact repeated occurrences and render author link', () => {
  const p = createTimelineDemo(); editor.setState({ project: p, contentTrackId: 'demo-clue', basis: 'narrative', occurrenceId: 'narrative-e1', selectedId: 'e1' }); render(<StoryTracksPanel/>); fireEvent.change(screen.getByLabelText('Content reveal target'), { target: { value: 'narrative-e9' } }); fireEvent.submit(screen.getByRole('form', { name: 'Content point editor' })); const link = editor.getState().project.storyTracks!.find(t => t.id === 'demo-clue')!.entries[0].reveal; assert.equal(link?.kind, 'occurrence'); assert.equal((link as any).occurrenceId, 'narrative-e9');
});
test('same-ID import discards unsaved point and definition text instead of leaking it into the new story', () => {
  presetTrack(); render(<StoryTracksPanel/>); fireEvent.change(screen.getByLabelText('Content point value'), { target: { value: 'unsaved old project' } });
  act(() => { const imported = clone(editor.getState().project); imported.title = 'A different story'; editor.getState().importProject(imported); }); assert.equal((screen.getByLabelText('Content point value') as HTMLInputElement).value, '');
  fireEvent.click(screen.getByRole('button', { name: /名稱與定義/ })); fireEvent.change(screen.getByLabelText('Content track name'), { target: { value: 'unsaved name' } });
  act(() => { const imported = clone(editor.getState().project); imported.title = 'Third story'; editor.getState().importProject(imported); }); assert.equal((screen.getByLabelText('Content track name') as HTMLInputElement).value, '自己命名');
});
test('visibility filters operate as view state and missing-owner fallback matches displayed selection', () => {
  const p = createSample(), a = newContentTrack('narrative'), b = newContentTrack('narrative'); a.name = 'A'; a.owner = { kind: 'character', trackId: 'lin' }; b.name = 'B'; saveContentTrack(p, a); saveContentTrack(p, b); editor.setState({ project: p, trackingOwner: 'all', trackingDimension: 'all', hiddenContentTrackIds: [] });
  render(<ControlsAndRows/>);
  fireEvent.change(screen.getByLabelText('Tracking owner filter'), { target: { value: ownerKey(a.owner) } }); assert.equal(document.querySelectorAll('[data-content-track]').length, 1); const history = editor.getState().past.length;
  fireEvent.click(screen.getByLabelText('Show content track A')); assert.equal(document.querySelectorAll('[data-content-track]').length, 0); assert.equal(editor.getState().past.length, history);
  act(() => editor.getState().transact(next => removeContentTrack(next, a.id))); assert.equal((screen.getByLabelText('Tracking owner filter') as HTMLSelectElement).value, 'all'); assert.equal(document.querySelectorAll('[data-content-track]').length, 1);
});
const { useEditor } = await import('./store');
function useEditorProject() { return useEditor(s => s.project); }
function ControlsAndRows() { const p = useEditorProject(); return <><StoryTrackControls/><StoryTrackRows p={p} basis="narrative" occurrenceId="narrative-e1"/></>; }
test('world relationship editor preserves initial order, exposes explicit removal and refuses conflict', () => {
  render(<RealityTimingEditor eventId="e1"/>); fireEvent.click(screen.getByRole('button', { name: 'Enable world relationships' })); assert.equal(editor.getState().project.realityTiming!.relations.length, 15);
  fireEvent.change(screen.getByLabelText('World relation target'), { target: { value: 'e2' } }); fireEvent.change(screen.getByLabelText('World relation kind'), { target: { value: 'same-time' } }); fireEvent.submit(screen.getByRole('form', { name: 'World relation form' })); assert.match(editor.getState().notice, /衝突/); assert.equal(editor.getState().project.realityTiming!.relations.length, 15);
  const id = editor.getState().project.realityTiming!.relations[0].id; fireEvent.click(screen.getByRole('button', { name: 'Remove world relation ' + id })); fireEvent.submit(screen.getByRole('form', { name: 'World relation form' })); assert.equal(editor.getState().notice, ''); assert.equal(editor.getState().project.realityTiming!.relations.some(r => r.kind === 'same-time'), true);
});
test('plot rows share Narrative columns, show multi-membership and retain repeated appearances', () => {
  editor.setState({ project: createTimelineDemo(), basis: 'narrative', occurrenceId: 'narrative-opening', selectedId: 'e9' }); compareApp(); assert.equal(document.querySelectorAll('[data-plot-occurrence="narrative-e3"]').length, 2); assert.equal(document.querySelectorAll('[data-plot-occurrence="narrative-opening"]').length, 1); assert.equal(document.querySelectorAll('[data-plot-occurrence="narrative-e9"]').length, 1);
  fireEvent.click(document.querySelector('[data-plot-occurrence="narrative-e9"]')!); assert.equal(editor.getState().occurrenceId, 'narrative-e9'); assert.ok(document.querySelector('[data-focus-basis="narrative"]')); assert.equal(editor.getState().project.units.filter(u => u.kind === 'beat').length, 16);
});
test('opening a bound source moves focus and first source edit retains that exact source', () => {
  editor.setState({ project: createTimelineDemo(), basis: 'narrative', occurrenceId: 'narrative-opening', selectedId: 'e9', contentTrackId: 'demo-lin-goal' }); compareApp(); fireEvent.click(document.querySelector('[data-overview-occurrence="narrative-e9"]')!);
  act(() => editor.setState({ contentTrackId: 'demo-lin-goal', panel: 'tracking', inspectorOpen: true })); fireEvent.click(screen.getByRole('button', { name: '開啟來源設定' })); assert.equal(editor.getState().basis, 'reality'); const id = editor.getState().occurrenceId; assert.ok(document.querySelector('[data-focus-basis="reality"]'));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited source event' } }); fireEvent.blur(screen.getByLabelText('Title')); assert.equal(editor.getState().basis, 'reality'); assert.equal(editor.getState().occurrenceId, id); assert.equal(editor.getState().notice, '');
});
test('selected Outline context add/up/delete is explicit, undoable and preserves world order', () => {
  compareApp(); act(() => editor.setState({ outlineOpen: true })); fireEvent.click(screen.getByRole('button', { name: 'Add act' })); const id = editor.getState().selectedId, world = clone(editor.getState().project.timelines.reality.placements); const actions = document.querySelector(`[data-outline-actions="${id}"]`)!;
  fireEvent.click(within(actions as HTMLElement).getByRole('button', { name: 'Move selected structure up' })); assert.deepEqual(editor.getState().project.timelines.reality.placements, world);
  fireEvent.click(within(document.querySelector(`[data-outline-actions="${id}"]`) as HTMLElement).getByRole('button', { name: 'Delete selected structure' })); assert.equal(editor.getState().project.units.some(u => u.id === id), false); act(() => editor.getState().undo()); assert.equal(editor.getState().project.units.some(u => u.id === id), true);
});
test('tracking edits autosave to the same device-local key without replacing other domains', () => {
  presetTrack(); const timeline = clone(editor.getState().project.timelines); render(<StoryTracksPanel/>); fireEvent.change(screen.getByLabelText('Content point value'), { target: { value: 'saved state' } }); fireEvent.submit(screen.getByRole('form', { name: 'Content point editor' })); act(() => saveNow()); const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!); assert.equal(saved.storyTracks[0].entries[0].value, 'saved state'); assert.deepEqual(saved.timelines, timeline);
});
