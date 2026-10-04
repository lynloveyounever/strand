/** Deterministic authoring model. These weights are not measured audience probabilities. */
export const ENGINE_VERSION = 'audience-rules/1.0';
export type ExpectationStatus = 'open' | 'delayed' | 'fulfilled' | 'subverted';
export type ExpectationState = { text: string; kind: 'prediction' | 'hope' | 'fear'; strength: number; status: ExpectationStatus };
export type AudienceState = {
  knowledge: Record<string, boolean | null>;
  beliefs: Record<string, number | null>;
  expectations: Record<string, ExpectationState>;
};
export type Condition =
  | { kind: 'knowledge'; key: string; equals: boolean }
  | { kind: 'belief'; key: string; op: 'gte' | 'lte'; value: number }
  | { kind: 'expectation'; key: string; status: ExpectationStatus | 'active' | 'absent'; minStrength?: number };
export type RuleSource =
  | { kind: 'manual' }
  | { kind: 'director'; move: DirectorMove; eventId: string; revision: number }
  | { kind: 'accepted-proposal'; proposalId: string; acceptedAt: string };
export type RuleInstance = {
  id: string;
  ruleId: string;
  occurrenceId: string;
  target: string;
  text: string;
  expectationKind: ExpectationState['kind'];
  amount: number;
  weight: number;
  order: number;
  enabled: boolean;
  saturation: 'linear' | 'headroom';
  conflict: 'ordered' | 'exclusive';
  conditions: Condition[];
  range?: { startId: string; endId: string };
  source: RuleSource;
};
export type EngineConfig = {
  version: 1;
  initial: AudienceState;
  rules: RuleInstance[];
  decay: { enabled: boolean; perStep: number };
};
export type EngineOccurrence = { id: string; eventId: string; title: string; directorRevision: number };
export type EngineInput = { occurrences: EngineOccurrence[]; config: EngineConfig; context?: unknown };
export type TraceStatus = 'applied' | 'disabled' | 'inapplicable' | 'unknown' | 'unregistered' | 'conflict' | 'out-of-scope';
export type ConditionRead = { condition: Condition | string; value: unknown; result: 'true' | 'false' | 'unknown' };
export type Delta = {
  path: string;
  before: unknown;
  after: unknown;
  requested?: number;
  effective?: number;
  clamped: boolean;
};
export type Trace = {
  id: string;
  occurrenceId: string | null;
  eventId: string | null;
  ordinal: number | null;
  ruleId: string;
  instanceId: string;
  status: TraceStatus;
  reason: string;
  reads: ConditionRead[];
  deltas: Delta[];
  rule: RuleInstance | null;
};
export type EngineRun = {
  engineVersion: string;
  fingerprint: string;
  positionUnit: 'occurrence';
  input: EngineInput;
  initial: AudienceState;
  final: AudienceState;
  trace: Trace[];
  checkpoints: { occurrenceId: string; before: AudienceState; after: AudienceState; complete: boolean }[];
  complete: boolean;
  unresolvedCount: number;
};
export type EngineAction =
  | { type: 'expectation.create'; target: string; value: ExpectationState; requested: number }
  | { type: 'expectation.strength'; target: string; requested: number }
  | { type: 'expectation.status'; target: string; status: ExpectationStatus }
  | { type: 'knowledge.set'; target: string; value: boolean }
  | { type: 'belief.adjust'; target: string; requested: number };
type Plan = { actions: EngineAction[]; reads: ConditionRead[]; status?: 'unknown' | 'inapplicable'; reason?: string };
export type RegisteredRule = { id: string; label: string; description: string; plan: (state: AudienceState, rule: RuleInstance) => Plan };
const copy = <T,>(x: T): T => structuredClone(x);
export const emptyAudienceState = (): AudienceState => ({ knowledge: {}, beliefs: {}, expectations: {} });
export const emptyEngineConfig = (): EngineConfig => ({ version: 1, initial: emptyAudienceState(), rules: [], decay: { enabled: false, perStep: 0.05 } });
const bounded = (n: number) => Math.max(0, Math.min(1, n));
const active = (e: ExpectationState) => e.status === 'open' || e.status === 'delayed';
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const entry = <T,>(map: Record<string,T>, key: string): T | undefined => own(map,key) ? map[key] : undefined;
const readExpectation = (state: AudienceState, rule: RuleInstance) => ({ condition: 'expectation exists and is active', value: copy(entry(state.expectations,rule.target) ?? null), result: !own(state.expectations,rule.target) ? 'unknown' : active(entry(state.expectations,rule.target)!) ? 'true' : 'false' }) as ConditionRead;
function existing(state: AudienceState, rule: RuleInstance, actions: EngineAction[]): Plan {
  const read = readExpectation(state, rule);
  return read.result === 'unknown' ? { actions: [], reads: [read], status: 'unknown', reason: 'Target expectation is not established; no effect was assumed.' }
    : read.result === 'false' ? { actions: [], reads: [read], status: 'inapplicable', reason: 'Target expectation is already resolved.' }
    : { actions, reads: [read] };
}
export const ruleRegistry: Readonly<Record<string, RegisteredRule>> = Object.freeze(Object.fromEntries(([
  { id: 'expectation.establish', label: '建立預期', description: 'Create an explicit expectation; an existing expectation is not overwritten.', plan: (s, r) => own(s.expectations,r.target) ? { actions: [], reads: [{ condition: 'expectation is absent', value: entry(s.expectations,r.target), result: 'false' }], status: 'inapplicable', reason: 'Expectation already exists; use reinforce or another target.' } : { reads: [{ condition: 'expectation is absent', value: null, result: 'true' }], actions: [{ type: 'expectation.create', target: r.target, requested: r.amount * r.weight, value: { text: r.text || r.target, kind: r.expectationKind, status: 'open', strength: bounded(r.amount * r.weight) } }] } },
  { id: 'expectation.reinforce', label: '強化預期', description: 'Add weighted strength to an active expectation.', plan: (s, r) => existing(s,r,[{ type: 'expectation.strength', target: r.target, requested: r.amount * r.weight * (r.saturation === 'headroom' ? 1 - (entry(s.expectations,r.target)?.strength ?? 0) : 1) }]) },
  { id: 'expectation.delay', label: '延後回收', description: 'Mark an active expectation delayed; strength changes only through configured decay.', plan: (s, r) => existing(s,r,[{ type: 'expectation.status', target: r.target, status: 'delayed' }]) },
  { id: 'expectation.fulfill', label: '實現預期', description: 'Resolve an active expectation as fulfilled; strength records its pre-resolution intensity.', plan: (s, r) => existing(s,r,[{ type: 'expectation.status', target: r.target, status: 'fulfilled' }]) },
  { id: 'expectation.subvert', label: '推翻預期', description: 'Resolve an active expectation as subverted; this does not infer a human emotion.', plan: (s, r) => existing(s,r,[{ type: 'expectation.status', target: r.target, status: 'subverted' }]) },
  { id: 'knowledge.reveal', label: '揭露已知資訊', description: 'Set an explicitly keyed fact to known.', plan: (s, r) => ({ reads: [{ condition: 'previous knowledge', value: entry(s.knowledge,r.target) ?? null, result: 'true' }], actions: [{ type: 'knowledge.set', target: r.target, value: true }] }) },
  { id: 'belief.adjust', label: '調整相信程度', description: 'Add a signed weighted amount to an explicitly initialized belief. Missing belief is unknown.', plan: (s, r) => !own(s.beliefs,r.target) || entry(s.beliefs,r.target) === null ? { reads: [{ condition: 'belief initialized', value: null, result: 'unknown' }], actions: [], status: 'unknown', reason: 'Belief has no initial value; missing does not mean zero.' } : { reads: [{ condition: 'previous belief', value: entry(s.beliefs,r.target), result: 'true' }], actions: [{ type: 'belief.adjust', target: r.target, requested: r.amount * r.weight * (r.saturation === 'headroom' ? r.amount >= 0 ? 1 - entry(s.beliefs,r.target)! : entry(s.beliefs,r.target)! : 1) }] } },
] satisfies RegisteredRule[]).map(r=>[r.id,r])));
export const directorMoves = {
  plant: { label: '埋下線索', ruleId: 'expectation.establish' },
  echo: { label: '重複提示', ruleId: 'expectation.reinforce' },
  withhold: { label: '暫緩答案', ruleId: 'expectation.delay' },
  payoff: { label: '揭曉／回收', ruleId: 'expectation.fulfill' },
  reversal: { label: '逆轉解讀', ruleId: 'expectation.subvert' },
  reveal: { label: '揭露資訊', ruleId: 'knowledge.reveal' },
  steer: { label: '調整相信', ruleId: 'belief.adjust' },
} as const;
export type DirectorMove = keyof typeof directorMoves;
export function newRule(id: string, occurrenceId: string, ruleId = 'expectation.establish'): RuleInstance {
  return { id, occurrenceId, ruleId, target: 'expectation-1', text: '', expectationKind: 'prediction', amount: 0.4, weight: 1, order: 10, enabled: true, saturation: 'linear', conflict: 'ordered', conditions: [], source: { kind: 'manual' } };
}
export function readCondition(s: AudienceState, c: Condition): ConditionRead {
  if (c.kind === 'knowledge') { const value = entry(s.knowledge,c.key); return { condition: c, value: value ?? null, result: value == null ? 'unknown' : value === c.equals ? 'true' : 'false' }; }
  if (c.kind === 'belief') { const value = entry(s.beliefs,c.key); return { condition: c, value: value ?? null, result: value == null ? 'unknown' : (c.op === 'gte' ? value >= c.value : value <= c.value) ? 'true' : 'false' }; }
  const value = entry(s.expectations,c.key);
  if (c.status === 'absent') return { condition: c, value: value ?? null, result: value ? 'false' : 'true' };
  return { condition: c, value: value ?? null, result: !value ? 'unknown' : (c.status === 'active' ? active(value) : value.status === c.status) && (c.minStrength === undefined || value.strength >= c.minStrength) ? 'true' : 'false' };
}
function apply(state: AudienceState, action: EngineAction): Delta {
  const target = action.target;
  switch (action.type) {
    case 'expectation.create': state.expectations[target] = copy(action.value); return { path: `expectations.${target}`, before: null, after: copy(action.value), requested: action.requested, effective: action.value.strength, clamped: action.requested !== action.value.strength };
    case 'expectation.status': { const e = state.expectations[target], before = e.status; e.status = action.status; return { path: `expectations.${target}.status`, before, after: e.status, clamped: false }; }
    case 'knowledge.set': { const before = entry(state.knowledge,target) ?? null; state.knowledge[target] = action.value; return { path: `knowledge.${target}`, before, after: action.value, clamped: false }; }
    case 'expectation.strength': { const e = state.expectations[target], before = e.strength, raw = before + action.requested; e.strength = bounded(raw); return { path: `expectations.${target}.strength`, before, after: e.strength, requested: action.requested, effective: e.strength - before, clamped: e.strength !== raw }; }
    case 'belief.adjust': { const before = state.beliefs[target]!, raw = before + action.requested; state.beliefs[target] = bounded(raw); return { path: `beliefs.${target}`, before, after: state.beliefs[target], requested: action.requested, effective: state.beliefs[target]! - before, clamped: raw !== state.beliefs[target] }; }
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical((value as Record<string, unknown>)[key])).join(',') + '}';
}
/** Full canonical signature avoids hash collisions for persistence/staleness checks. */
export function inputFingerprint(input: EngineInput) { return canonical({ engineVersion: ENGINE_VERSION, input }); }
export function evaluateAudience(input: EngineInput): EngineRun {
  validateEngineConfig(input.config);
  const state = copy(input.config.initial), trace: Trace[] = [], checkpoints: EngineRun['checkpoints'] = [];
  const occurrenceIds = new Set(input.occurrences.map(o => o.id));
  if (occurrenceIds.size !== input.occurrences.length) throw new Error('Duplicate audience occurrence IDs');
  const unresolved = (t: Trace) => ['unknown', 'unregistered', 'conflict'].includes(t.status);
  const emit = (rule: RuleInstance, o: EngineOccurrence | null, ordinal: number | null, status: TraceStatus, reason: string, reads: ConditionRead[] = [], deltas: Delta[] = []) => trace.push({ id: `rule:${rule.id}@${o?.id ?? 'missing'}`, occurrenceId: o?.id ?? null, eventId: o?.eventId ?? null, ordinal, ruleId: rule.ruleId, instanceId: rule.id, rule: copy(rule), status, reason, reads: copy(reads), deltas });
  for (const rule of input.config.rules) if (!occurrenceIds.has(rule.occurrenceId)) emit(rule,null,null,rule.enabled ? 'unknown' : 'disabled','Occurrence was removed or is not on the Audience timeline; repair the link.');
  for (const [index, o] of input.occurrences.entries()) {
    const before = copy(state);
    if (index > 0 && input.config.decay.enabled && input.config.decay.perStep > 0) {
      const deltas: Delta[] = [];
      for (const [key,e] of Object.entries(state.expectations).sort(([a],[b])=>a<b?-1:a>b?1:0)) if (active(e)) deltas.push(apply(state,{type:'expectation.strength',target:key,requested:-e.strength * input.config.decay.perStep}));
      trace.push({ id: `system:decay@${o.id}`, occurrenceId:o.id,eventId:o.eventId,ordinal:index+1,ruleId:'system.decay',instanceId:'system.decay',rule:null,status:'applied',reason:`Explicit decay ×${1-input.config.decay.perStep} once per occurrence interval; ordinal position is not seconds.`,reads:[{condition:'configured per-occurrence decay',value:copy(input.config.decay),result:'true'}],deltas });
    }
    const rules = input.config.rules.filter(r => r.occurrenceId === o.id).sort((a,b) => a.order-b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const writes = new Map<string, { instanceId: string; exclusive: boolean }>();
    for (const rule of rules) {
      if (!rule.enabled) { emit(rule,o,index+1,'disabled','Rule disabled explicitly.'); continue; }
      if (rule.weight === 0) { emit(rule,o,index+1,'disabled','Weight is zero; explicit no-op including categorical actions.'); continue; }
      const registered = own(ruleRegistry,rule.ruleId) ? ruleRegistry[rule.ruleId] : undefined;
      if (!registered) { emit(rule,o,index+1,'unregistered','No registered implementation; effect remains unresolved, not zero.'); continue; }
      if (rule.range) {
        const start = input.occurrences.findIndex(x=>x.id===rule.range!.startId), end=input.occurrences.findIndex(x=>x.id===rule.range!.endId);
        if (start < 0 || end < 0 || start > end) { emit(rule,o,index+1,'unknown','Range is missing or reversed; repair explicitly.'); continue; }
        if (index < start || index > end) { emit(rule,o,index+1,'out-of-scope','Occurrence is outside the inclusive configured range.'); continue; }
      }
      if (rule.source.kind === 'director' && (rule.source.eventId !== o.eventId || rule.source.revision !== o.directorRevision)) { emit(rule,o,index+1,'unknown','Director realization changed; review and relink this mapping before running it.'); continue; }
      const reads = rule.conditions.map(c=>readCondition(state,c));
      if (reads.some(r=>r.result==='false')) { emit(rule,o,index+1,'inapplicable','At least one explicit condition is false.',reads); continue; }
      if (reads.some(r=>r.result==='unknown')) { emit(rule,o,index+1,'unknown','A condition has no known input; no effect was assumed.',reads); continue; }
      // Reserve the whole target; detect conflicts before terminal-state guards mask them.
      const domain = `${rule.ruleId.split('.')[0]}:${rule.target}`;
      const previous= writes.get(domain);
      if(previous && (previous.exclusive || rule.conflict==='exclusive')) { emit(rule,o,index+1,'conflict',`Exclusive target already written by ${previous.instanceId}; this later rule is blocked.`,reads); continue; }
      const plan = registered.plan(state,rule); reads.push(...plan.reads);
      if (plan.status) { emit(rule,o,index+1,plan.status,plan.reason!,reads); continue; }
      const domains=plan.actions.map(a => `${a.type.split('.')[0]}:${a.target}`);
      const deltas=plan.actions.map(action=>apply(state,action));
      for(const domain of domains)writes.set(domain,{instanceId:rule.id,exclusive:rule.conflict==='exclusive'});
      emit(rule,o,index+1,'applied',rule.ruleId==='expectation.delay'||rule.ruleId==='expectation.fulfill'||rule.ruleId==='expectation.subvert'||rule.ruleId==='knowledge.reveal'?'Categorical transition: positive weight enables the action; magnitude does not scale a category.':'Applied in (Audience occurrence order, rule order, rule ID) order.',reads,deltas);
    }
    checkpoints.push({occurrenceId:o.id,before,after:copy(state),complete:!trace.some(unresolved)});
  }
  const unresolvedCount=trace.filter(unresolved).length;
  return {engineVersion:ENGINE_VERSION,fingerprint:inputFingerprint(input),positionUnit:'occurrence',input:copy(input),initial:copy(input.config.initial),final:copy(state),trace,checkpoints,complete:unresolvedCount===0,unresolvedCount};
}
export function isRunStale(run: EngineRun, input: EngineInput) { return run.engineVersion !== ENGINE_VERSION || run.fingerprint !== inputFingerprint(input); }
export function compareRuns(baseline: EngineRun, current: EngineRun) {
  const keys=[...new Set([...Object.keys(baseline.final.expectations),...Object.keys(current.final.expectations)])].sort();
  return { comparable: baseline.complete && current.complete, rows: keys.map(key=>({key,before:entry(baseline.final.expectations,key)??null,after:entry(current.final.expectations,key)??null,strengthDelta:baseline.complete&&current.complete&&entry(baseline.final.expectations,key)&&entry(current.final.expectations,key)?entry(current.final.expectations,key)!.strength-entry(baseline.final.expectations,key)!.strength:null})) };
}
export type RuleProposal = { id: string; status: 'proposed' | 'accepted' | 'rejected'; origin: string; rules: RuleInstance[]; acceptedAt?: string };
/** Future LLM adapter returns proposals only. Nothing here performs network calls or executes a proposal. */
export interface RuleProposalProvider { propose(input: EngineInput, request: string): Promise<RuleProposal>; }
export function acceptRuleProposal(config: EngineConfig, proposal: RuleProposal, userDecision: { accepted: true; at: string }): EngineConfig {
  if (proposal.status !== 'proposed' || !userDecision.accepted || !userDecision.at) throw new Error('Explicit user acceptance is required');
  const next=copy(config);next.rules.push(...proposal.rules.map(r=>({...copy(r),source:{kind:'accepted-proposal' as const,proposalId:proposal.id,acceptedAt:userDecision.at}})));validateEngineConfig(next);return next;
}
const safeKey = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','prototype','constructor'].includes(v);
const text = (v: unknown,max=20000) => typeof v === 'string' && v.length<=max;
const num = (v: unknown,min:number,max:number) => typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const record = (v: unknown): v is Record<string,unknown> => !!v&&typeof v==='object'&&!Array.isArray(v);
export function validateEngineConfig(value: unknown): asserts value is EngineConfig {
  const fail = () => { throw new Error('Invalid audience rule-engine configuration'); };
  if(!record(value))return fail();const c=value as unknown as EngineConfig;
  if(c.version!==1||!record(c.initial)||!record(c.initial.knowledge)||!record(c.initial.beliefs)||!record(c.initial.expectations)||!Array.isArray(c.rules)||c.rules.length>1000||!record(c.decay)||typeof c.decay.enabled!=='boolean'||!num(c.decay.perStep,0,1))fail();
  for(const map of [c.initial.knowledge,c.initial.beliefs,c.initial.expectations])if(Object.keys(map).length>1000)fail();
  for(const [k,v]of Object.entries(c.initial.knowledge))if(!safeKey(k)||(v!==null&&typeof v!=='boolean'))fail();
  for(const [k,v]of Object.entries(c.initial.beliefs))if(!safeKey(k)||(v!==null&&!num(v,0,1)))fail();
  for(const [k,e]of Object.entries(c.initial.expectations))if(!safeKey(k)||!record(e)||!text(e.text)||!['prediction','hope','fear'].includes(e.kind)||!num(e.strength,0,1)||!['open','delayed','fulfilled','subverted'].includes(e.status))fail();
  const ids=new Set<string>();
  for(const r of c.rules){
    if(!record(r)||!safeKey(r.id)||ids.has(r.id)||!text(r.ruleId,150)||!r.ruleId||!safeKey(r.occurrenceId)||!safeKey(r.target)||!text(r.text)||!['prediction','hope','fear'].includes(r.expectationKind)||!num(r.amount,-1,1)||!num(r.weight,0,2)||!num(r.order,0,9999)||!Number.isInteger(r.order)||typeof r.enabled!=='boolean'||!['linear','headroom'].includes(r.saturation)||!['ordered','exclusive'].includes(r.conflict)||!Array.isArray(r.conditions)||r.conditions.length>50||!record(r.source))fail();
    ids.add(r.id);
    if(r.ruleId.startsWith('expectation.')&&r.amount<0)fail();
    if(r.range!==undefined&&(!record(r.range)||!safeKey(r.range.startId)||!safeKey(r.range.endId)))fail();
    for(const x of r.conditions){if(!record(x)||!safeKey(x.key))fail();if(x.kind==='knowledge'){if(typeof x.equals!=='boolean')fail();}else if(x.kind==='belief'){if(!['gte','lte'].includes(x.op)||!num(x.value,0,1))fail();}else if(x.kind==='expectation'){if(!['open','delayed','fulfilled','subverted','active','absent'].includes(x.status)||(x.minStrength!==undefined&&!num(x.minStrength,0,1)))fail();}else fail();}
    if(r.source.kind==='director'){if(!own(directorMoves,r.source.move)||!safeKey(r.source.eventId)||!num(r.source.revision,1,Number.MAX_SAFE_INTEGER)||!Number.isInteger(r.source.revision))fail();}
    else if(r.source.kind==='accepted-proposal'){if(!safeKey(r.source.proposalId)||!text(r.source.acceptedAt,100)||!r.source.acceptedAt)fail();}else if(r.source.kind!=='manual')fail();
  }
}
