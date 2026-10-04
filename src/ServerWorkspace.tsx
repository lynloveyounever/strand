import { useEffect, useRef, useState } from 'react';
import { clone, type Project } from './model';
import { editor, useEditor } from './store';
import { ServerError, StrandServerClient, type ProjectRecord, type ProjectSummary, type ProjectVersion, type Proposal, type ServerConfig } from './serverClient';

type Preview = { kind: 'create' | 'replace'; project: Project; localSource: Project; remote?: ProjectRecord };
type RemotePreview = { record: ProjectRecord; localSource: Project };
function commitFocusedField() { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }
function formatValue(value: unknown) { return value === undefined ? '(absent)' : JSON.stringify(value, null, 2); }
function Snapshot({ project }: { project: Project }) {
  return <div className="server-snapshot"><strong>{project.title}</strong><p>{project.premise || 'No premise yet'}</p><span>{project.units.filter(u => u.kind === 'beat').length} events · {project.tracks.length} perspective tracks</span><details><summary>Inspect full snapshot</summary><pre>{JSON.stringify(project, null, 2)}</pre></details></div>;
}

/** Optional server work never participates in the local autosave subscription. */
export default function ServerWorkspace() {
  const local = useEditor(s => s.project);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [session, setSession] = useState<{ client: StrandServerClient; config: ServerConfig } | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [remote, setRemote] = useState<ProjectRecord | null>(null);
  const [remotePreview, setRemotePreview] = useState<RemotePreview | null>(null);
  const [sendPreview, setSendPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<ProjectVersion[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const request = useRef<{ id: number; controller: AbortController } | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; request.current?.controller.abort(); request.current = null; }; }, []);

  function cancel() {
    sequence.current++; request.current?.controller.abort(); request.current = null; setBusy(''); setSendPreview(null);
    setMessage('Stopped waiting. A server action may already have completed. Refresh projects or proposals before trying again. Your local story is unchanged.');
  }
  function disconnect() {
    sequence.current++; request.current?.controller.abort(); request.current = null;
    setSession(null); setToken(''); setProjects(null); setHistory(null); setRemote(null); setRemotePreview(null); setSendPreview(null); setProposals([]); setPrompt(''); setBusy(''); setError(''); setConflict(false);
    setMessage('Disconnected. The token was cleared from this panel. Local edits remain on this device.');
  }
  async function run<T>(label: string, action: (signal: AbortSignal) => Promise<T>, done: (value: T) => void) {
    // The ref closes the repeated-click gap before React renders disabled buttons.
    if (request.current) return;
    const id = ++sequence.current, controller = new AbortController();
    request.current = { id, controller }; setBusy(label); setError(''); setMessage('');
    try {
      const value = await action(controller.signal);
      if (mounted.current && id === sequence.current && !controller.signal.aborted) done(value);
    } catch (e) {
      if (mounted.current && id === sequence.current && !controller.signal.aborted) {
        const isConflict = e instanceof ServerError && e.status === 409;
        setConflict(isConflict);
        setError(isConflict ? `The server changed${e.currentRevision ? ` to revision ${e.currentRevision}` : ''}. Refresh the remote preview, then review again. Nothing was overwritten locally.`
          : e instanceof ServerError && e.status === 503 && e.code === 'provider_not_configured' ? 'The assistant provider is not configured or is unavailable. Your project is unchanged; configure the server provider and reconnect to try again.'
          : e instanceof ServerError && e.status === 0 ? `${e.message} A server action may already have completed; refresh before trying a write again.`
          : e instanceof Error ? e.message : 'The request failed. Your local story is unchanged.');
        if (isConflict) setSendPreview(null);
      }
    } finally {
      if (mounted.current && id === sequence.current) { request.current = null; setBusy(''); }
    }
  }
  function connect() {
    let client: StrandServerClient;
    try { client = new StrandServerClient(url, token); } catch (e) { setError((e as Error).message); return; }
    void run('Connecting…', s => client.config(s), config => { setSession({ client, config }); setToken(''); setConflict(false); setMessage('Connected. No local story has been sent.'); });
  }
  function previewRemote(id: string) {
    if (!session) return;
    commitFocusedField();
    const localSource = editor.getState().project;
    setSendPreview(null);
    void run('Fetching remote preview…', s => session.client.getProject(id, s), record => {
      setRemote(record); setHistory(null); setRemotePreview({ record, localSource }); setProposals([]); setConflict(false);
      setMessage('Remote snapshot ready to review. It has not replaced your local story.');
    });
  }
  function prepareSend(kind: Preview['kind']) {
    if (kind === 'replace' && !remote) return;
    commitFocusedField();
    const current = editor.getState().project;
    setSendPreview({ kind, project: clone(current), localSource: current, ...(kind === 'replace' ? { remote: remote! } : {}) });
    setRemotePreview(null); setError(''); setMessage('');
  }
  function sendSnapshot() {
    if (!session || !sendPreview || request.current) return;
    commitFocusedField();
    const preview = sendPreview;
    if (editor.getState().project !== preview.localSource) { setError('Your local story changed after this preview. Cancel and preview the current version again.'); return; }
    void run('Sending reviewed snapshot…', s => preview.kind === 'replace' && preview.remote
      ? session.client.replaceProject(preview.remote.id, preview.remote.revision, preview.project, s)
      : session.client.createProject(preview.project, s), record => {
        setRemote(record); setHistory(null); setSendPreview(null); setRemotePreview(null); setProjects(null); setProposals([]); setConflict(false);
        setMessage(`Snapshot saved on the server at revision ${record.revision}. Later local edits are not sent automatically.`);
      });
  }
  function loadRemote() {
    if (!remotePreview || request.current) return;
    commitFocusedField();
    if (editor.getState().project !== remotePreview.localSource) { setError('Your local story changed after this preview. Refresh and review again before loading.'); return; }
    try {
      editor.getState().importProject(clone(remotePreview.record.project)); setRemotePreview(null);
      setMessage('Remote snapshot loaded on this device. Undo restores the previous local story. Future edits stay local.'); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  function askAssistant() {
    if (!session || !remote || !prompt.trim()) return;
    const current = remote;
    void run('Preparing an assistant proposal…', s => session.client.askAssistant(current.id, current.revision, prompt.trim(), s), p => {
      if (p.project_id !== current.id) throw new Error('The server returned a proposal for another project.');
      setProposals(old => [p, ...old.filter(item => item.id !== p.id)]); setMessage('Proposal ready. Review the before/after changes, then approve or reject it.');
    });
  }
  function reviewProposal(p: Proposal, approve: boolean) {
    if (!session || !remote || p.project_id !== remote.id || p.status !== 'pending') return;
    const current = remote;
    if (approve) void run('Approving remote changes…', s => session.client.accept(current.id, p.id, p.base_revision, s), record => {
      setRemote(record); setHistory(null); setProposals(old => old.map(item => item.id === p.id ? { ...item, status: 'accepted' } : item)); setRemotePreview(null); setSendPreview(null); setProjects(null);
      setMessage(`Approved on the server at revision ${record.revision}. Your local story is unchanged. Preview the remote snapshot to load it separately.`);
    });
    else void run('Rejecting proposal…', s => session.client.reject(current.id, p.id, s), result => {
      setProposals(old => old.map(item => item.id === result.id ? result : item)); setMessage('Proposal rejected. Both stories are unchanged.');
    });
  }
  const sendingStale = !!sendPreview && sendPreview.localSource !== local;
  const loadingStale = !!remotePreview && remotePreview.localSource !== local;

  return <section className="server-workspace" aria-label="Server and assistant">
    <details><summary>Server & assistant <span>Optional</span></summary>
      <p className="server-help">Your story is saved on this device. Connecting adds a separate owner-only server workspace. There is no automatic sync. No live server or assistant is included.</p>
      {!session ? <form onSubmit={e => { e.preventDefault(); connect(); }}>
        <label>Server URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-strand-server.example" autoComplete="off" required disabled={!!busy}/></label>
        <label>Owner token<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} required disabled={!!busy}/></label>
        <p className="server-help">Use only a server you trust. The token is sent to that address and kept in this open panel’s memory only. Closing settings disconnects and clears it. HTTP is allowed only on localhost.</p>
        <button type="submit" disabled={!!busy}>Connect to server</button>
      </form> : <>
        <div className="server-connection"><div><strong>Connected</strong><span>{session.client.baseUrl}</span><small>Separate SQLite server storage</small></div><button onClick={disconnect}>Disconnect & clear token</button></div>
        <p className="server-help">Assistant: {session.config.provider_configured ? 'provider configured on the server' : 'not configured on the server'}. Closing settings disconnects this panel.</p>
        <div className="server-actions">
          <button disabled={!!busy} onClick={() => prepareSend('create')}>Preview local snapshot to send</button>
          <button disabled={!!busy} onClick={() => void run('Listing remote projects…', s => session.client.listProjects(s), setProjects)}>Refresh remote projects</button>
        </div>
        {projects && <div className="server-projects" aria-label="Remote projects"><h3>Remote projects</h3>{projects.length ? projects.map(p => <div key={p.id}><span><strong>{p.title}</strong><small>Revision {p.revision}</small></span><button disabled={!!busy} onClick={() => previewRemote(p.id)}>Preview {p.title}</button></div>) : <p>No remote projects yet. Send a reviewed local snapshot to create one.</p>}</div>}
        {remote && <div className="server-remote"><h3>Selected remote project</h3><p><strong>{remote.project.title}</strong> · revision {remote.revision}</p><p className="server-help">The assistant uses this server snapshot. Unsaved-to-server local edits are not included.</p><div className="server-actions"><button disabled={!!busy} onClick={() => previewRemote(remote.id)}>Refresh remote preview</button><button disabled={!!busy || conflict} onClick={() => prepareSend('replace')}>Preview replacing remote with local</button><button disabled={!!busy} onClick={() => void run('Loading remote history…', s => session.client.history(remote.id, s), setHistory)}>Refresh remote history</button></div>
          {history && <section className="server-history" aria-label="Remote version history"><h4>Remote version history</h4><p className="server-help">Saved versions are retained on the server. This list is read-only and separate from this device’s Undo history.</p>{history.length ? <ol>{history.map(v => <li key={v.revision}><strong>Revision {v.revision}</strong><span>{v.summary}</span><small>{v.source} · {v.at}</small></li>)}</ol> : <p>No saved versions returned.</p>}</section>}
        </div>}
        {sendPreview && <section className="server-review" aria-label="Review snapshot to send"><h3>{sendPreview.kind === 'create' ? 'Create a remote project' : 'Replace the selected remote snapshot'}</h3><p>The full reviewed story, including all text, tracks, and approval history, will be sent to {session.client.baseUrl}.</p>{sendPreview.remote && <p>Target: {sendPreview.remote.project.title}, revision {sendPreview.remote.revision}. The server retains earlier versions. This does not merge changes.</p>}<Snapshot project={sendPreview.project}/>{sendingStale && <p className="server-warning">Local edits changed after this preview. Cancel and preview again.</p>}<div className="server-actions"><button disabled={!!busy || sendingStale} onClick={sendSnapshot}>{sendPreview.kind === 'create' ? 'Confirm send snapshot' : 'Confirm replace remote snapshot'}</button><button disabled={!!busy} onClick={() => setSendPreview(null)}>Cancel snapshot preview</button></div></section>}
        {remotePreview && <section className="server-review" aria-label="Review remote snapshot"><h3>Review remote revision {remotePreview.record.revision}</h3><Snapshot project={remotePreview.record.project}/><p>Loading replaces the story on this device and adds an Undo step. It does not change the server.</p>{loadingStale && <p className="server-warning">Your local story changed while this preview was open. Refresh the preview to review again.</p>}<div className="server-actions"><button disabled={!!busy || loadingStale} onClick={loadRemote}>Confirm load into local editor</button><button disabled={!!busy} onClick={() => setRemotePreview(null)}>Dismiss remote preview</button></div></section>}
        {remote && <section className="server-assistant" aria-label="Assistant proposals"><h3>Assistant proposals</h3><p className="server-help">A request sends your prompt to this server. Its configured AI provider can receive the remote story. Suggestions never apply automatically. External MCP clients can also leave proposals here for your review.</p><form onSubmit={e => { e.preventDefault(); askAssistant(); }}><label>Ask the assistant<textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="For example: suggest a clearer goal for the opening event" rows={3} maxLength={10000} disabled={!!busy || !session.config.provider_configured}/></label><div className="server-actions"><button type="submit" disabled={!!busy || !prompt.trim() || !session.config.provider_configured || conflict}>Request proposal</button><button type="button" disabled={!!busy} onClick={() => void run('Loading proposals…', s => session.client.proposals(remote.id, s), items => { if (items.some(p => p.project_id !== remote.id)) throw new Error('The server returned proposals for another project.'); setProposals(items); setMessage(items.length ? 'Proposals loaded for review.' : 'No proposals for this project.'); })}>Refresh proposals</button></div></form>
          {proposals.map(p => <article className="server-proposal" key={p.id} aria-label={`Proposal: ${p.summary}`}><header><strong>{p.summary}</strong><span>{p.status} · base revision {p.base_revision}</span></header><p className="server-help">Source: {p.source}</p>{p.changes.length ? <ol className="server-diff">{p.changes.map((c, i) => <li key={`${c.path}-${i}`}><strong>{c.path}</strong><div><section><h4>Before</h4><pre>{formatValue(c.before)}</pre></section><section><h4>After</h4><pre>{formatValue(c.after)}</pre></section></div></li>)}</ol> : <p>No field changes reported.</p>}<details><summary>Inspect structured operations</summary><pre>{JSON.stringify(p.operations, null, 2)}</pre></details>{p.status === 'pending' && <><p>Approving changes only the remote project. Load the result separately if you want it on this device.</p>{p.base_revision !== remote.revision && <p className="server-warning">This proposal uses an older revision. Refresh the remote project and request a new proposal.</p>}<div className="server-actions"><button disabled={!!busy || conflict || p.base_revision !== remote.revision} onClick={() => reviewProposal(p, true)}>Approve remote changes</button><button disabled={!!busy} onClick={() => reviewProposal(p, false)}>Reject proposal</button></div></>}</article>)}
        </section>}
      </>}
      {busy && <div className="server-actions"><p role="status">{busy}</p><button onClick={cancel}>Cancel request</button></div>}
      {message && <p className="server-status" role="status">{message}</p>}
      {error && <p className="server-warning" role="alert">{error}</p>}
    </details>
  </section>;
}
