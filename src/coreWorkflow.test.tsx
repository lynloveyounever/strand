import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://strand-core.test' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, confirm: () => true, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
const { render, fireEvent, screen, cleanup, act } = await import('@testing-library/react');
const { default: App } = await import('./App');
const { editor, makeStore, saveNow, readSavedProject, STORAGE_KEY } = await import('./store');
const { createBlankProject, clone, parseProject } = await import('./model');
function reset() { const { set, transact, undo, redo, importProject, ...state } = makeStore(createBlankProject()).getState(); act(() => editor.setState(state)); }
function openSettings() { fireEvent.click(document.querySelector<HTMLButtonElement>('.brand button')!); }
function draft(label: string, value: string) { const input = screen.getByLabelText(label); act(() => input.focus()); fireEvent.change(input, { target: { value } }); return input; }
function deferredFile(title: string) { let resolve!: (text: string) => void; const promise = new Promise<string>(r => { resolve = r; }); const p = createBlankProject(); p.title = title; return { file: { size: 4000, text: () => promise }, finish: () => resolve(JSON.stringify(p)) }; }
function importFile(file: { size: number; text: () => Promise<string> }) { fireEvent.change(document.querySelector<HTMLInputElement>('input[type=file]')!, { target: { files: [file] } }); }
function write(label: string, value: string) { const field = draft(label, value); fireEvent.blur(field); }
function expand(selector: string) { act(() => document.querySelectorAll<HTMLDetailsElement>(selector).forEach(d => { d.open = true; })); }
beforeEach(() => { reset(); localStorage.clear(); Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true }); globalThis.confirm = () => true; });
afterEach(() => cleanup());

test('Escape commits focused project settings before closing and save/reopen preserves them', () => {
  render(<App/>); openSettings(); const input = draft('Premise', '兄妹必須一起找回失蹤的地圖');
  fireEvent.keyDown(input, { key: 'Escape' });
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(editor.getState().project.premise, '兄妹必須一起找回失蹤的地圖');
  act(() => saveNow()); assert.equal(readSavedProject(localStorage).project.premise, '兄妹必須一起找回失蹤的地圖');
});

test('Escape during Chinese IME composition keeps project settings and its focused draft open', () => {
  render(<App/>); openSettings(); const input = draft('Premise', '尚在選字中的構想');
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
  assert.ok(screen.getByRole('dialog')); assert.equal(document.activeElement, input);
  assert.equal(editor.getState().project.premise, ''); assert.equal((input as HTMLTextAreaElement).value, '尚在選字中的構想');
  fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 }); assert.ok(screen.getByRole('dialog'));
  fireEvent.keyDown(input, { key: 'Escape', isComposing: false });
  assert.equal(screen.queryByRole('dialog'), null); assert.equal(editor.getState().project.premise, '尚在選字中的構想');
});

test('reader inline editing also keeps Chinese composition Escape inside its focused draft', () => {
  render(<App/>); fireEvent.click(screen.getByRole('button', { name: '編輯發生什麼' }));
  const input = draft('發生什麼', '尚在選字中的事件');
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
  assert.ok(screen.getByRole('region', { name: 'Edit story logic' })); assert.equal(document.activeElement, input);
  assert.equal(editor.getState().project.units[4].summary, '');
  fireEvent.keyDown(input, { key: 'Escape' });
  assert.equal(screen.queryByRole('region', { name: 'Edit story logic' }), null);
  assert.equal(editor.getState().project.units[4].summary, '尚在選字中的事件');
});

test('same-value import invalidates an unsaved legacy settings draft', () => {
  render(<App/>); openSettings(); draft('Premise', '舊作品還沒儲存的內容');
  const replacement = clone(editor.getState().project); replacement.title = '匯入的作品';
  act(() => editor.getState().importProject(replacement));
  fireEvent.blur(screen.getByLabelText('Premise'));
  assert.deepEqual(editor.getState().project, replacement);
});

test('a slower earlier file import cannot overwrite the newer chosen file', async () => {
  render(<App/>); const first = deferredFile('先選取但較慢'), second = deferredFile('後選取的檔案');
  importFile(first.file); importFile(second.file);
  await act(async () => second.finish()); assert.equal(editor.getState().project.title, '後選取的檔案');
  await act(async () => first.finish()); assert.equal(editor.getState().project.title, '後選取的檔案');
});

test('editing while a file is still loading preserves the current story instead of replacing it', async () => {
  render(<App/>); const pending = deferredFile('較早選取的備份'); importFile(pending.file);
  act(() => editor.getState().transact(p => { p.premise = '讀檔途中繼續寫的新內容'; }));
  const current = clone(editor.getState().project);
  await act(async () => pending.finish());
  assert.deepEqual(editor.getState().project, current);
  assert.match(editor.getState().notice, /重新選取|changed/);
});

test('a late file read also preserves text that is still focused and not yet committed', async () => {
  render(<App/>); const pending = deferredFile('較早的備份'); importFile(pending.file);
  fireEvent.click(screen.getByRole('button', { name: 'Build story blueprint' })); draft('發生什麼', '讀檔途中還在輸入的事件');
  await act(async () => pending.finish());
  assert.equal(editor.getState().project.units.find(u => u.kind === 'beat')?.summary, '讀檔途中還在輸入的事件');
  assert.match(editor.getState().notice, /重新選取/);
});

test('cancelled, malformed, incomplete, oversized and failed file reads preserve story and history, then the same input can recover', async () => {
  render(<App/>); const before = clone(editor.getState().project), history = editor.getState().past.length;
  let confirmations = 0; globalThis.confirm = () => { confirmations++; return false; };
  const cancelled = deferredFile('不匯入'); importFile(cancelled.file); await act(async () => cancelled.finish());
  assert.equal(confirmations, 1);
  for (const file of [
    { size: 3, text: async () => '{' },
    { size: 100, text: async () => JSON.stringify({ schemaVersion: 2, title: '缺少結構' }) },
    { size: 8_000_001, text: async () => { throw new Error('should not read'); } },
    { size: 100, text: async () => { throw new Error('Read interrupted'); } },
  ]) { await act(async () => importFile(file)); assert.deepEqual(editor.getState().project, before); assert.equal(editor.getState().past.length, history); }
  assert.equal(confirmations, 1);
  globalThis.confirm = () => true;
  await act(async () => importFile({ size: 5000, text: async () => JSON.stringify({ ...before, title: '重新匯入成功' }) }));
  assert.equal(editor.getState().project.title, '重新匯入成功');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' })); assert.deepEqual(editor.getState().project, before);
  fireEvent.click(screen.getByRole('button', { name: 'Redo' })); assert.equal(editor.getState().project.title, '重新匯入成功');
});

test('an abandoned earlier read error cannot replace the result of a newer import', async () => {
  render(<App/>); let reject!: (e: Error) => void;
  importFile({ size: 10, text: () => new Promise<string>((_, r) => { reject = r; }) });
  const latest = deferredFile('保留後選的作品'); importFile(latest.file); await act(async () => latest.finish());
  const notice = editor.getState().notice; await act(async () => reject(new Error('Old read failure')));
  assert.equal(editor.getState().project.title, '保留後選的作品'); assert.equal(editor.getState().notice, notice);
});

test('an unmounted import cannot change the next editor session', async () => {
  const { unmount } = render(<App/>); const pending = deferredFile('已離開的匯入'); importFile(pending.file); unmount();
  await act(async () => pending.finish()); assert.equal(editor.getState().project.title, '未命名故事');
});

for (const width of [320, 1440]) test(`project modal close, reopen, cancel new story and export retain focused edits (${width}px DOM)`, async () => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true }); render(<App/>);
  openSettings(); draft('Premise', '第一次關閉前的構想'); fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
  openSettings(); assert.equal((screen.getByLabelText('Premise') as HTMLTextAreaElement).value, '第一次關閉前的構想');
  draft('Project title', '兩條交錯的故事線'); globalThis.confirm = () => false; fireEvent.click(screen.getByRole('button', { name: 'New blank story' }));
  assert.equal(editor.getState().project.title, '兩條交錯的故事線'); assert.ok(screen.getByRole('dialog'));
  const blobs: Blob[] = [], oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldClick = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = blob => { blobs.push(blob as Blob); return 'blob:core'; }; URL.revokeObjectURL = () => {}; dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    draft('Premise', '備份當下還在輸入的构想'); fireEvent.click(screen.getByRole('button', { name: 'Export JSON ↗' }));
    assert.equal(parseProject(await blobs[0].text()).premise, '備份當下還在輸入的构想');
    assert.deepEqual(readSavedProject(localStorage).project, editor.getState().project);
    draft('Premise', '點背景也保留'); fireEvent.click(document.querySelector('.modal-backdrop')!);
    openSettings(); assert.equal((screen.getByLabelText('Premise') as HTMLTextAreaElement).value, '點背景也保留');
  } finally { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; dom.window.HTMLAnchorElement.prototype.click = oldClick; }
});

for (const width of [320, 1440]) test(`new two-plot story deletion, undo/redo, local reopen and actual file backup restoration (${width}px DOM)`, async () => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true }); render(<App/>);
  fireEvent.click(screen.getByRole('button', { name: '建立新故事' })); write('發生什麼', '姊姊找到地圖');
  expand('.event-plot-editor'); fireEvent.change(screen.getByLabelText('新增故事線名稱'), { target: { value: '尋找父親' } }); fireEvent.click(screen.getByRole('button', { name: '建立並加入此事件' }));
  fireEvent.click(screen.getByRole('button', { name: '＋ 此場事件' })); const second = editor.getState().selectedId;
  write('發生什麼', '弟弟藏起地圖'); write('為什麼發生', '他不信任姊姊'); write('造成什麼結果', '兩人分頭尋找父親');
  expand('.author-causal-source,.event-plot-editor'); fireEvent.change(screen.getByLabelText('原因承接哪個事件（選填）'), { target: { value: 'new-beat' } });
  fireEvent.click(screen.getByLabelText('尋找父親')); fireEvent.change(screen.getByLabelText('新增故事線名稱'), { target: { value: '手足信任' } }); fireEvent.click(screen.getByRole('button', { name: '建立並加入此事件' }));
  expand('.author-editor details'); const world = clone(editor.getState().project.timelines.reality), audience = clone(editor.getState().project.timelines.audience);
  fireEvent.click(screen.getByRole('button', { name: '結構上移' })); assert.deepEqual(editor.getState().project.timelines.reality, world); assert.deepEqual(editor.getState().project.timelines.audience, audience);
  const backup = clone(editor.getState().project);
  globalThis.confirm = () => false; fireEvent.click(screen.getByRole('button', { name: '刪除此事件' })); assert.deepEqual(editor.getState().project, backup);
  globalThis.confirm = () => true; fireEvent.click(screen.getByRole('button', { name: '刪除此事件' }));
  assert.equal(editor.getState().project.units.some(u => u.id === second), false);
  for (const timeline of Object.values(editor.getState().project.timelines)) assert.equal(timeline.placements.some(o => o.eventId === second), false);
  assert.equal(editor.getState().project.narrativeLines?.some(line => line.eventIds.includes(second)), false);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' })); assert.deepEqual(editor.getState().project, backup);
  fireEvent.click(screen.getByRole('button', { name: 'Redo' })); act(() => saveNow()); const deleted = clone(editor.getState().project);
  assert.deepEqual(readSavedProject(localStorage).project, deleted);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  const blobs: Blob[] = [], oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldClick = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = b => { blobs.push(b as Blob); return 'blob:backup'; }; URL.revokeObjectURL = () => {}; dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    fireEvent.click(screen.getByRole('button', { name: /04閱讀藍圖/ })); fireEvent.click(screen.getByRole('button', { name: '備份全部資料 .json' }));
    const json = await blobs[0].text(); assert.deepEqual(parseProject(json), backup);
    act(() => editor.getState().importProject(deleted)); await act(async () => importFile({ size: blobs[0].size, text: async () => json }));
    assert.deepEqual(editor.getState().project, backup); act(() => saveNow());
    assert.deepEqual(readSavedProject(localStorage).project, backup);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' })); assert.deepEqual(editor.getState().project, deleted);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' })); assert.deepEqual(editor.getState().project, backup);
  } finally { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; dom.window.HTMLAnchorElement.prototype.click = oldClick; }
});

test('storage failure leaves the story exportable and a later successful save recovers the same data', () => {
  render(<App/>); fireEvent.click(screen.getByRole('button', { name: 'Build story blueprint' })); write('發生什麼', '儲存失敗也不能丟失的事件');
  const setItem = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => { throw new Error('quota exceeded'); };
  try { act(() => saveNow()); assert.match(editor.getState().saveStatus, /Save failed/); assert.equal(parseProject(JSON.stringify(editor.getState().project)).units[4].summary, '儲存失敗也不能丟失的事件'); }
  finally { dom.window.Storage.prototype.setItem = setItem; }
  act(() => saveNow()); assert.match(editor.getState().saveStatus, /Saved/); assert.deepEqual(parseProject(localStorage.getItem(STORAGE_KEY)!), editor.getState().project);
});
