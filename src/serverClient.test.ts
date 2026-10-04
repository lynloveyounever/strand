import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrandServerClient, ServerError, normalizeServerUrl } from './serverClient';
import { createBlankProject } from './model';
const signal = () => new AbortController().signal;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const config = { storage: 'sqlite', provider_configured: false, operations: [] };

test('server URL requires HTTPS except exact loopback hosts and rejects URL credentials', () => {
  for (const value of [' https://example.test/base/// ', 'https://example.test/base/']) assert.equal(normalizeServerUrl(value), 'https://example.test/base');
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(normalizeServerUrl(`http://${host}:8000/`), `http://${host}:8000`);
  for (const value of ['example.test', 'http://example.test', 'http://localhost.evil.test', 'http://127.0.0.2', 'file:///secret', 'https://user:secret@example.test', 'https://example.test?token=abc', 'https://example.test/#secret']) assert.throws(() => normalizeServerUrl(value));
  assert.throws(() => new StrandServerClient('https://example.test', ''));
  assert.throws(() => new StrandServerClient('https://example.test', 'a\nb'));
});

test('client uses explicit bearer authorization, abort signal, and no browser credentials or redirects', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return json(config); }) as typeof fetch;
  const client = new StrandServerClient('https://example.test/base/', ' fake-test-token ', fetcher), s = signal();
  assert.deepEqual(await client.config(s), config);
  assert.equal(calls[0].url, 'https://example.test/base/api/config');
  assert.equal(calls[0].init.signal, s); assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.cache, 'no-store'); assert.equal(calls[0].init.referrerPolicy, 'no-referrer');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer fake-test-token' });
  assert.equal(calls[0].init.body, undefined);
});

test('snapshot mutations and assistant acceptance use exact reviewed base revisions', async () => {
  const calls: { url: string; init: RequestInit }[] = [], project = createBlankProject();
  const record = { id: 'remote', revision: 3, updated_at: '2026-10-03', project };
  const proposal = { id: 'proposal', project_id: 'remote', base_revision: 3, status: 'pending', summary: 'Review', operations: [], changes: [], created_at: '2026-10-03', source: 'assistant' };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return json(String(url).endsWith('/assistant') ? proposal : { ...record, id: String(url).includes('remote%2Fpath') ? 'remote/path' : 'remote' }); }) as typeof fetch;
  const client = new StrandServerClient('https://example.test', 'fake', fetcher);
  assert.deepEqual((await client.createProject(project, signal())).project, project);
  await client.replaceProject('remote/path', 2, project, signal()); await client.askAssistant('remote', 3, 'Improve the opening', signal()); await client.accept('remote', 'proposal/id', 3, signal());
  assert.equal(calls[0].init.method, 'POST'); assert.deepEqual(JSON.parse(String(calls[0].init.body)), { project });
  assert.equal(calls[1].url, 'https://example.test/api/projects/remote%2Fpath'); assert.equal(calls[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { base_revision: 2, project });
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { base_revision: 3, prompt: 'Improve the opening' });
  assert.equal(calls[3].url, 'https://example.test/api/projects/remote/proposals/proposal%2Fid/accept');
  assert.deepEqual(JSON.parse(String(calls[3].init.body)), { base_revision: 3 });
});

test('server conflict details remain structured; malformed success cannot become a local project', async () => {
  const conflict = new StrandServerClient('https://example.test', 'fake', (async () => json({ detail: { code: 'revision_conflict', message: 'Changed', current_revision: 4 } }, 409)) as typeof fetch);
  await assert.rejects(() => conflict.getProject('a', signal()), (e: unknown) => e instanceof ServerError && e.status === 409 && e.code === 'revision_conflict' && e.currentRevision === 4);
  for (const value of [{}, { id: 'a', revision: 1, updated_at: '', project: { schemaVersion: 2 } }]) {
    const malformed = new StrandServerClient('https://example.test', 'fake', (async () => json(value)) as typeof fetch);
    await assert.rejects(() => malformed.getProject('a', signal()), (e: unknown) => e instanceof ServerError && e.code === 'invalid_response');
  }
});

test('unreadable, network, provider unavailable, and malformed proposal responses fail safely', async () => {
  const unreadable = new StrandServerClient('https://example.test', 'fake', (async () => new Response('<html>error</html>', { status: 500 })) as typeof fetch);
  await assert.rejects(() => unreadable.config(signal()), /unreadable/);
  const network = new StrandServerClient('https://example.test', 'fake', (async () => { throw new Error('private transport detail'); }) as typeof fetch);
  await assert.rejects(() => network.config(signal()), /Cannot reach/);
  const unavailable = new StrandServerClient('https://example.test', 'fake', (async () => json({ detail: { code: 'provider_unconfigured', message: 'Not configured' } }, 503)) as typeof fetch);
  await assert.rejects(() => unavailable.askAssistant('a', 1, 'Hi', signal()), (e: unknown) => e instanceof ServerError && e.status === 503);
  const malformed = new StrandServerClient('https://example.test', 'fake', (async () => json({ proposals: [{ id: 'a' }] })) as typeof fetch);
  await assert.rejects(() => malformed.proposals('a', signal()), /invalid response/);
});

test('record responses cannot cross project boundaries and version history is validated', async () => {
  const mismatched = new StrandServerClient('https://example.test', 'fake', (async () => json({ id: 'another-project', revision: 1, project: createBlankProject(), updated_at: '' })) as typeof fetch);
  await assert.rejects(() => mismatched.getProject('expected-project', signal()), /invalid response/);
  const version = { revision: 1, at: '2026-10-03', source: 'owner', summary: 'Created' };
  const valid = new StrandServerClient('https://example.test', 'fake', (async () => json({ versions: [version] })) as typeof fetch);
  assert.deepEqual(await valid.history('expected-project', signal()), [version]);
  const invalid = new StrandServerClient('https://example.test', 'fake', (async () => json({ versions: [{ revision: '1' }] })) as typeof fetch);
  await assert.rejects(() => invalid.history('expected-project', signal()), /invalid response/);
});
