import { parseProject, type Project } from './model';

export type ServerConfig = { storage: 'sqlite'; provider_configured: boolean; operations: string[] };
export type ProjectSummary = { id: string; title: string; revision: number; updated_at: string };
export type ProjectRecord = { id: string; revision: number; project: Project; updated_at: string };
export type ProjectVersion = { revision: number; at: string; source: string; summary: string };
export type ProposalChange = { path: string; before: unknown; after: unknown };
export type Proposal = {
  id: string; project_id: string; base_revision: number; status: 'pending' | 'accepted' | 'rejected';
  summary: string; operations: unknown[]; changes: ProposalChange[]; created_at: string; source: string;
};
export class ServerError extends Error {
  constructor(message: string, public status = 0, public code = 'request_failed', public currentRevision?: number) {
    super(message); this.name = 'ServerError';
  }
}
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a complete HTTPS server URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Use HTTPS. HTTP is allowed only on localhost.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Server URLs cannot contain credentials, a query, or a fragment.');
  return url.href.replace(/\/+$/, '');
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function invalid(): never { throw new ServerError('The server returned an invalid response. Nothing was loaded into this device.', 0, 'invalid_response'); }
function record(value: unknown): ProjectRecord {
  if (!object(value) || typeof value.id !== 'string' || !value.id || !revision(value.revision) || typeof value.updated_at !== 'string') return invalid();
  try { return { id: value.id, revision: value.revision, updated_at: value.updated_at, project: parseProject(JSON.stringify(value.project)) }; } catch { return invalid(); }
}
function proposal(value: unknown): Proposal {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.project_id !== 'string' || !revision(value.base_revision)
    || !['pending', 'accepted', 'rejected'].includes(String(value.status)) || typeof value.summary !== 'string'
    || !Array.isArray(value.operations) || !Array.isArray(value.changes) || typeof value.created_at !== 'string' || typeof value.source !== 'string') return invalid();
  if (value.changes.some(c => !object(c) || typeof c.path !== 'string' || !('before' in c) || !('after' in c))) return invalid();
  return value as Proposal;
}

/** This object and its bearer token live only in the open component's memory. */
export class StrandServerClient {
  readonly baseUrl: string;
  private readonly token: string;
  constructor(baseUrl: string, token: string, private readonly fetcher: typeof fetch = globalThis.fetch) {
    this.baseUrl = normalizeServerUrl(baseUrl);
    this.token = token.trim();
    if (!this.token || /[\r\n]/.test(this.token)) throw new Error('Enter a valid owner token.');
  }
  private async request(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/api${path}`, {
        method, signal, mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ServerError('Cannot reach this server. Check its URL, connection, HTTPS, and allowed browser origin.');
    }
    let data: unknown;
    try { data = await response.json(); } catch { throw new ServerError(`The server returned an unreadable response (${response.status}).`, response.status, 'invalid_response'); }
    if (!response.ok) {
      const detail = object(data) && object(data.detail) ? data.detail : {};
      const message = typeof detail.message === 'string' ? detail.message : `Request failed (${response.status}).`;
      throw new ServerError(message, response.status, typeof detail.code === 'string' ? detail.code : 'request_failed', revision(detail.current_revision) ? detail.current_revision : undefined);
    }
    return data;
  }
  async config(signal: AbortSignal): Promise<ServerConfig> {
    const value = await this.request('/config', signal);
    if (!object(value) || value.storage !== 'sqlite' || typeof value.provider_configured !== 'boolean' || !Array.isArray(value.operations) || value.operations.some(v => typeof v !== 'string')) return invalid();
    return value as ServerConfig;
  }
  async listProjects(signal: AbortSignal): Promise<ProjectSummary[]> {
    const value = await this.request('/projects', signal);
    if (!object(value) || !Array.isArray(value.projects) || value.projects.some(p => !object(p) || typeof p.id !== 'string' || typeof p.title !== 'string' || !revision(p.revision) || typeof p.updated_at !== 'string')) return invalid();
    return value.projects as ProjectSummary[];
  }
  private projectRecord(value: unknown, expectedId: string) {
    const result = record(value);
    if (result.id !== expectedId) return invalid();
    return result;
  }
  async getProject(id: string, signal: AbortSignal) { return this.projectRecord(await this.request(`/projects/${encodeURIComponent(id)}`, signal), id); }
  async createProject(project: Project, signal: AbortSignal) { return record(await this.request('/projects', signal, 'POST', { project })); }
  async replaceProject(id: string, baseRevision: number, project: Project, signal: AbortSignal) { return this.projectRecord(await this.request(`/projects/${encodeURIComponent(id)}`, signal, 'PUT', { base_revision: baseRevision, project }), id); }
  async askAssistant(id: string, baseRevision: number, prompt: string, signal: AbortSignal) { return proposal(await this.request(`/projects/${encodeURIComponent(id)}/assistant`, signal, 'POST', { base_revision: baseRevision, prompt })); }
  async proposals(id: string, signal: AbortSignal): Promise<Proposal[]> {
    const value = await this.request(`/projects/${encodeURIComponent(id)}/proposals`, signal);
    if (!object(value) || !Array.isArray(value.proposals)) return invalid();
    return value.proposals.map(proposal);
  }
  async accept(id: string, proposalId: string, baseRevision: number, signal: AbortSignal) { return this.projectRecord(await this.request(`/projects/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/accept`, signal, 'POST', { base_revision: baseRevision }), id); }
  async history(id: string, signal: AbortSignal): Promise<ProjectVersion[]> {
    const value = await this.request(`/projects/${encodeURIComponent(id)}/history`, signal);
    if (!object(value) || !Array.isArray(value.versions) || value.versions.some(v => !object(v) || !revision(v.revision) || typeof v.at !== 'string' || typeof v.source !== 'string' || typeof v.summary !== 'string')) return invalid();
    return value.versions as ProjectVersion[];
  }
  async reject(id: string, proposalId: string, signal: AbortSignal) { return proposal(await this.request(`/projects/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/reject`, signal, 'POST', {})); }
}
