import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://strand-server.test' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
const { render, fireEvent, screen, cleanup, act, within } = await import('@testing-library/react');
const { default: ServerWorkspace } = await import('./ServerWorkspace');
const { editor, makeStore, saveNow } = await import('./store');
const { createBlankProject, clone } = await import('./model');
import type { ProjectRecord, Proposal } from './serverClient';
const originalFetch = globalThis.fetch;
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let handler: (call: Call) => Response | Promise<Response>;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function remote(revision = 1, title = 'Remote story'): ProjectRecord { return { id: 'remote-1', revision, updated_at: '2026-10-03', project: { ...createBlankProject(), title } }; }
function proposal(): Proposal { return { id: 'proposal-1', project_id: 'remote-1', base_revision: 1, status: 'pending', summary: 'Clarify the premise', operations: [{ op: 'replace', path: '/premise', value: 'Suggested premise' }], changes: [{ path: '/premise', before: '', after: 'Suggested premise' }], created_at: '2026-10-03', source: 'assistant' }; }
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; }
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); }
async function connect(provider = true) {
  handler = ({ url }) => url.endsWith('/config') ? json({ storage: 'sqlite', provider_configured: provider, operations: [] }) : json({ projects: [{ id: 'remote-1', title: 'Remote story', revision: 1, updated_at: '2026-10-03' }] });
  fireEvent.change(screen.getByLabelText('Server URL'), { target: { value: 'https://example.test' } });
  fireEvent.change(screen.getByLabelText('Owner token'), { target: { value: 'fake-test-owner-token' } });
  await click('Connect to server');
}
async function selectRemote() {
  await click('Refresh remote projects');
  handler = () => json(remote()); await click('Preview Remote story');
}
beforeEach(() => {
  const { set, transact, undo, redo, importProject, ...state } = makeStore(createBlankProject()).getState(); act(() => editor.setState(state));
  localStorage.clear(); calls = []; handler = () => { throw new Error('Unexpected network request'); };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { const call = { url: String(url), init: init! }; calls.push(call); return handler(call); }) as typeof fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('optional panel never connects or syncs without explicit action, and token is never persisted', async () => {
  render(<ServerWorkspace/>); assert.equal(calls.length, 0);
  act(() => editor.getState().transact(p => { p.title = 'Only local'; })); assert.equal(calls.length, 0);
  await connect(false); assert.equal(calls.length, 1); assert.ok(screen.getByText(/No local story has been sent/));
  assert.equal(screen.queryByLabelText('Owner token'), null);
  act(() => saveNow()); assert.doesNotMatch(JSON.stringify({ ...localStorage }), /fake-test-owner-token/);
  act(() => editor.getState().transact(p => { p.premise = 'Stays here'; })); assert.equal(calls.length, 1);
  await click('Disconnect & clear token'); assert.equal((screen.getByLabelText('Owner token') as HTMLInputElement).value, '');
  assert.equal(calls.length, 1); assert.equal(editor.getState().project.premise, 'Stays here');
});

test('sending requires snapshot preview and explicit confirmation, with an exact captured payload', async () => {
  render(<ServerWorkspace/>); await connect(); const before = clone(editor.getState().project);
  await click('Preview local snapshot to send'); assert.equal(calls.length, 1); assert.ok(screen.getByRole('region', { name: 'Review snapshot to send' }));
  await click('Cancel snapshot preview'); assert.equal(calls.length, 1);
  await click('Preview local snapshot to send'); handler = () => json(remote(1, before.title)); await click('Confirm send snapshot');
  assert.equal(calls.length, 2); assert.equal(calls[1].init.method, 'POST'); assert.deepEqual(JSON.parse(String(calls[1].init.body)), { project: before });
  assert.deepEqual(editor.getState().project, before); assert.equal(editor.getState().past.length, 0);
  assert.ok(screen.getByText(/Later local edits are not sent automatically/));
});

test('local edits invalidate a prepared send rather than silently changing its payload', async () => {
  render(<ServerWorkspace/>); await connect(); await click('Preview local snapshot to send');
  act(() => editor.getState().transact(p => { p.title = 'Changed after review'; }));
  assert.equal((screen.getByRole('button', { name: 'Confirm send snapshot' }) as HTMLButtonElement).disabled, true);
  await click('Confirm send snapshot'); assert.equal(calls.length, 1);
  await click('Cancel snapshot preview'); await click('Preview local snapshot to send');
  assert.equal((screen.getByRole('button', { name: 'Confirm send snapshot' }) as HTMLButtonElement).disabled, false);
});

test('remote fetch stays a preview; explicitly loading is undoable and does not send local edits', async () => {
  render(<ServerWorkspace/>); await connect(); const original = clone(editor.getState().project);
  await selectRemote(); assert.deepEqual(editor.getState().project, original); assert.equal(editor.getState().past.length, 0);
  await click('Confirm load into local editor'); assert.equal(editor.getState().project.title, 'Remote story'); assert.equal(editor.getState().past.length, 1);
  act(() => editor.getState().undo()); assert.deepEqual(editor.getState().project, original);
  act(() => editor.getState().redo()); assert.equal(editor.getState().project.title, 'Remote story');
  assert.ok(calls.every(c => c.init.method === 'GET'));
});

test('a local edit during remote fetch cannot be overwritten by its late preview', async () => {
  render(<ServerWorkspace/>); await connect(); await click('Refresh remote projects'); const pending = deferred(); handler = () => pending.promise;
  await click('Preview Remote story'); act(() => editor.getState().transact(p => { p.title = 'Newer local edit'; }));
  await act(async () => pending.resolve(json(remote())));
  assert.equal((screen.getByRole('button', { name: 'Confirm load into local editor' }) as HTMLButtonElement).disabled, true);
  await click('Confirm load into local editor'); assert.equal(editor.getState().project.title, 'Newer local edit');
  handler = () => json(remote()); await click('Refresh remote preview'); await click('Confirm load into local editor');
  assert.equal(editor.getState().project.title, 'Remote story'); act(() => editor.getState().undo()); assert.equal(editor.getState().project.title, 'Newer local edit');
});

test('assistant displays structured before/after and approval changes only the remote copy', async () => {
  render(<ServerWorkspace/>); await connect(); await selectRemote(); const local = clone(editor.getState().project);
  fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: 'Clarify the premise' } }); handler = () => json(proposal());
  await click('Request proposal'); const review = screen.getByRole('article', { name: 'Proposal: Clarify the premise' });
  assert.ok(within(review).getByText('Before')); assert.ok(within(review).getByText('After')); assert.ok(within(review).getByText('"Suggested premise"'));
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.init.body)), { base_revision: 1, prompt: 'Clarify the premise' });
  const accepted = remote(2); accepted.project.premise = 'Suggested premise'; handler = () => json(accepted);
  await click('Approve remote changes'); assert.deepEqual(JSON.parse(String(calls.at(-1)!.init.body)), { base_revision: 1 });
  assert.deepEqual(editor.getState().project, local); assert.equal(editor.getState().past.length, 0); assert.equal(screen.queryByRole('button', { name: 'Confirm load into local editor' }), null);
  assert.ok(screen.getByText(/Approved on the server at revision 2/));
  handler = () => json(accepted); await click('Refresh remote preview'); await click('Confirm load into local editor');
  assert.equal(editor.getState().project.premise, 'Suggested premise'); act(() => editor.getState().undo()); assert.deepEqual(editor.getState().project, local);
});

test('external proposals remain reviewable without a configured provider and rejection preserves both stories', async () => {
  render(<ServerWorkspace/>); await connect(false); await selectRemote(); const local = clone(editor.getState().project);
  assert.equal((screen.getByRole('button', { name: 'Request proposal' }) as HTMLButtonElement).disabled, true);
  handler = () => json({ proposals: [{ ...proposal(), source: 'mcp' }] }); await click('Refresh proposals');
  handler = () => json({ ...proposal(), source: 'mcp', status: 'rejected' }); await click('Reject proposal');
  assert.ok(calls.at(-1)!.url.endsWith('/reject')); assert.deepEqual(editor.getState().project, local); assert.ok(screen.getByText('rejected · base revision 1'));
});

test('replace requires explicit confirmation and revision conflict requires a fresh remote preview', async () => {
  render(<ServerWorkspace/>); await connect(); await selectRemote(); const local = clone(editor.getState().project);
  await click('Preview replacing remote with local'); const count = calls.length;
  handler = () => json({ detail: { code: 'revision_conflict', message: 'Changed', current_revision: 3 } }, 409);
  await click('Confirm replace remote snapshot'); assert.equal(calls.length, count + 1);
  assert.equal(calls.at(-1)!.init.method, 'PUT'); assert.deepEqual(JSON.parse(String(calls.at(-1)!.init.body)), { base_revision: 1, project: local });
  assert.match(screen.getByRole('alert').textContent!, /revision 3/); assert.deepEqual(editor.getState().project, local);
  assert.equal((screen.getByRole('button', { name: 'Preview replacing remote with local' }) as HTMLButtonElement).disabled, true);
  handler = () => json(remote(3)); await click('Refresh remote preview'); await click('Preview replacing remote with local');
  handler = () => json(remote(4)); await click('Confirm replace remote snapshot');
  assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).base_revision, 3); assert.deepEqual(editor.getState().project, local);
});

test('a 503 assistant response reports configuration honestly without a fake proposal or local writes', async () => {
  render(<ServerWorkspace/>); await connect(); await selectRemote(); const local = clone(editor.getState().project);
  fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: 'Improve this' } });
  handler = () => json({ detail: { code: 'provider_not_configured', message: 'Not configured' } }, 503); await click('Request proposal');
  assert.match(screen.getByRole('alert').textContent!, /not configured or is unavailable/); assert.equal(screen.queryByRole('article'), null); assert.deepEqual(editor.getState().project, local);
});

test('cancellation aborts a request and a stale response cannot replace a later session', async () => {
  render(<ServerWorkspace/>); await connect(); await selectRemote(); const pending = deferred(); handler = () => pending.promise;
  await click('Refresh remote preview'); const aborted = calls.at(-1)!.init.signal;
  await click('Cancel request'); assert.equal(aborted?.aborted, true);
  await click('Disconnect & clear token'); await connect();
  await act(async () => pending.resolve(json(remote(9, 'Abandoned result'))));
  assert.equal(screen.queryByText('Abandoned result'), null); assert.equal(screen.queryByText('Selected remote project'), null); assert.equal(editor.getState().project.title, '未命名故事');
});

test('unmount aborts assistant generation and later completion cannot mutate local or next panel', async () => {
  const view = render(<ServerWorkspace/>); await connect(); await selectRemote(); const pending = deferred(); handler = () => pending.promise;
  fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: 'A late request' } }); await click('Request proposal');
  const aborted = calls.at(-1)!.init.signal; view.unmount(); assert.equal(aborted?.aborted, true);
  render(<ServerWorkspace/>); await act(async () => pending.resolve(json(proposal())));
  assert.ok(screen.getByRole('button', { name: 'Connect to server' })); assert.equal(screen.queryByRole('article'), null); assert.equal(editor.getState().past.length, 0);
});

test('repeated confirm clicks issue one in-flight write and cancellation never claims rollback', async () => {
  render(<ServerWorkspace/>); await connect(); await click('Preview local snapshot to send'); const pending = deferred(); handler = () => pending.promise;
  await click('Confirm send snapshot'); await click('Confirm send snapshot'); assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
  await click('Cancel request'); assert.ok(screen.getByText(/may already have completed/));
  await act(async () => pending.resolve(json(remote()))); assert.equal(screen.queryByText('Selected remote project'), null); assert.equal(editor.getState().past.length, 0);
});

test('settings focus trap includes the optional summary and skips collapsed or disabled server inputs', async () => {
  const { default: App } = await import('./App');
  render(<App/>); fireEvent.click(document.querySelector<HTMLButtonElement>('.brand button')!);
  const close = screen.getByRole('button', { name: 'Close settings' });
  const summary = document.querySelector<HTMLElement>('.server-workspace > details > summary')!;
  act(() => close.focus()); fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); assert.equal(document.activeElement, summary);
  fireEvent.keyDown(summary, { key: 'Tab' }); assert.equal(document.activeElement, close);
  act(() => { (summary.parentElement as HTMLDetailsElement).open = true; });
  act(() => close.focus()); fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); assert.equal(document.activeElement, screen.getByRole('button', { name: 'Connect to server' }));
  fireEvent.change(screen.getByLabelText('Owner token'), { target: { value: 'temporary-owner-token' } });
  await click('Close settings'); fireEvent.click(document.querySelector<HTMLButtonElement>('.brand button')!);
  assert.equal((screen.getByLabelText('Owner token') as HTMLInputElement).value, ''); assert.equal(calls.length, 0);
});

test('non-provider 503 reports the server storage error rather than inventing a provider configuration problem', async () => {
  render(<ServerWorkspace/>); await connect(); await click('Preview local snapshot to send');
  handler = () => json({ detail: { code: 'storage_unavailable', message: 'Storage is temporarily unavailable.' } }, 503); await click('Confirm send snapshot');
  assert.match(screen.getByRole('alert').textContent!, /Storage is temporarily unavailable/); assert.doesNotMatch(screen.getByRole('alert').textContent!, /provider/);
});

test('remote revision history is explicit, read-only and separate from local Undo', async () => {
  render(<ServerWorkspace/>); await connect(); await selectRemote(); const local = clone(editor.getState().project), count = calls.length;
  assert.equal(screen.queryByRole('region', { name: 'Remote version history' }), null);
  handler = () => json({ versions: [{ revision: 1, at: '2026-10-03T18:00:00Z', source: 'owner', summary: 'Initial snapshot' }] });
  await click('Refresh remote history'); assert.equal(calls.length, count + 1); assert.ok(calls.at(-1)!.url.endsWith('/history')); assert.equal(calls.at(-1)!.init.method, 'GET');
  assert.ok(screen.getByRole('region', { name: 'Remote version history' })); assert.ok(screen.getByText('Initial snapshot'));
  assert.deepEqual(editor.getState().project, local); assert.equal(editor.getState().past.length, 0);
  handler = () => json(remote(2)); await click('Refresh remote preview'); assert.equal(screen.queryByRole('region', { name: 'Remote version history' }), null);
});
