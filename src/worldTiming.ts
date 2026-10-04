import { clone, emptySnapshot, uid, updateBlueprint, type Project, type Snapshot } from './model';

export type WorldRelation = { id: string; kind: 'before' | 'same-time'; fromEventId: string; toEventId: string; note: string };
export type RealityTiming = { mode: 'relations'; relations: WorldRelation[] };
export type WorldOrder = 'before' | 'after' | 'same-time' | 'unknown';
export const worldOrderLabels: Record<WorldOrder, string> = { before: '早於', after: '晚於', 'same-time': '同時', unknown: '先後未定' };
const cache = new WeakMap<Project, ReturnType<typeof relationGraph>>();
export function invalidateWorldTiming(p: Project) { cache.delete(p); }

/** Equivalence is explicit. Topological layers and drawing columns are never time. */
export function relationGraph(events: string[], relations: WorldRelation[]) {
  const parent = new Map(events.map(id => [id, id]));
  const root = (id: string): string => { let at = id; while (parent.get(at) !== at) { const next = parent.get(at); if (!next) throw new Error('世界時序參照不存在的事件'); at = next; } return at; };
  for (const r of relations) {
    if (!parent.has(r.fromEventId) || !parent.has(r.toEventId)) throw new Error('世界時序參照不存在的事件');
    if (r.kind === 'same-time') parent.set(root(r.toEventId), root(r.fromEventId));
  }
  const groups = new Map<string, string[]>();
  for (const id of events) { const key = root(id); groups.set(key, [...(groups.get(key) ?? []), id]); }
  const edges = new Map([...groups.keys()].map(id => [id, new Set<string>()]));
  for (const r of relations.filter(r => r.kind === 'before')) {
    const from = root(r.fromEventId), to = root(r.toEventId);
    if (from === to) throw new Error(`時序衝突：${r.fromEventId} 與 ${r.toEventId} 已屬同時事件，不能又有先後。請先調整相關關係。`);
    edges.get(from)!.add(to);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string, path: string[]) {
    if (visiting.has(id)) throw new Error(`時序形成循環：${[...path, id].join(' → ')}。請先移除矛盾的先後關係。`);
    if (visited.has(id)) return;
    visiting.add(id); for (const to of edges.get(id)!) visit(to, [...path, id]); visiting.delete(id); visited.add(id);
  }
  for (const id of groups.keys()) visit(id, []);
  const reach = new Map<string, Set<string>>();
  const reachable = (from: string): Set<string> => {
    if (reach.has(from)) return reach.get(from)!;
    const all = new Set<string>(); for (const to of edges.get(from) ?? []) { all.add(to); for (const next of reachable(to)) all.add(next); } reach.set(from, all); return all;
  };
  const compare = (a: string, b: string): WorldOrder => {
    if (!parent.has(a) || !parent.has(b)) return 'unknown';
    const ar = root(a), br = root(b);
    return ar === br ? 'same-time' : reachable(ar).has(br) ? 'before' : reachable(br).has(ar) ? 'after' : 'unknown';
  };
  return { groups, edges, root, compare, reachable };
}
function graph(p: Project) {
  let found = cache.get(p);
  if (!found) { found = relationGraph(p.units.filter(u => u.kind === 'beat').map(u => u.id), p.realityTiming?.relations ?? []); cache.set(p, found); }
  return found;
}
export function compareWorldEvents(p: Project, a: string, b: string): WorldOrder {
  if (p.realityTiming) return graph(p).compare(a, b);
  const list = p.timelines.reality.placements, ai = list.findIndex(o => o.eventId === a), bi = list.findIndex(o => o.eventId === b);
  return ai < 0 || bi < 0 ? 'unknown' : ai === bi ? 'same-time' : ai < bi ? 'before' : 'after';
}
export function sameTimeGroups(p: Project) { return p.realityTiming ? [...graph(p).groups.values()].filter(ids => ids.length > 1) : []; }
function changed(p: Project) { invalidateWorldTiming(p); updateBlueprint(p, p.units.find(u => u.kind === 'story')!.id); }
export function enableWorldRelations(p: Project) {
  if (p.realityTiming) return;
  const list = p.timelines.reality.placements;
  p.realityTiming = { mode: 'relations', relations: list.slice(1).map((o, i) => ({ id: uid(), kind: 'before', fromEventId: list[i].eventId, toEventId: o.eventId, note: '由原本世界順序保留的先後' })) };
  changed(p);
}
export function setWorldRelation(p: Project, relation: WorldRelation) {
  if (!p.realityTiming) throw new Error('請先啟用明確世界時序');
  const i = p.realityTiming.relations.findIndex(r => r.id === relation.id);
  if (i < 0) p.realityTiming.relations.push(clone(relation)); else if (JSON.stringify(p.realityTiming.relations[i]) === JSON.stringify(relation)) return; else p.realityTiming.relations[i] = clone(relation);
  try { validateWorldTiming(p); } catch (error) {
    let message = (error as Error).message;
    for (const event of p.units.filter(u => u.kind === 'beat').sort((a, b) => b.id.length - a.id.length)) message = message.replace(new RegExp('(?<![a-zA-Z0-9_-])' + event.id + '(?![a-zA-Z0-9_-])', 'g'), '〈' + event.title + '〉');
    throw new Error(message);
  }
  changed(p);
}
export function removeWorldRelation(p: Project, id: string) {
  if (!p.realityTiming?.relations.some(r => r.id === id)) return;
  p.realityTiming.relations = p.realityTiming.relations.filter(r => r.id !== id); changed(p);
}
export function validateWorldTiming(p: Project) {
  if (p.realityTiming === undefined) return;
  const t = p.realityTiming, fail = () => { throw new Error('Invalid project: world-time relationships'); };
  if (!t || t.mode !== 'relations' || !Array.isArray(t.relations) || t.relations.length > 10000) fail();
  const ids = new Set<string>(), pairs = new Set<string>();
  const validId = (x: unknown) => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x) && !['__proto__', 'constructor', 'prototype'].includes(x);
  for (const r of t.relations) {
    if (!r || !validId(r.id) || ids.has(r.id) || !['before', 'same-time'].includes(r.kind) || !validId(r.fromEventId) || !validId(r.toEventId) || r.fromEventId === r.toEventId || typeof r.note !== 'string' || r.note.length > 20000) fail();
    const pair = r.kind + '|' + (r.kind === 'same-time' ? [r.fromEventId, r.toEventId].sort().join('|') : r.fromEventId + '|' + r.toEventId);
    if (pairs.has(pair)) throw new Error('這組世界時序關係已經存在');
    ids.add(r.id); pairs.add(pair);
  }
  relationGraph(p.units.filter(u => u.kind === 'beat').map(u => u.id), t.relations);
}

/** Preserve entailed survivor relationships when an intermediate canonical event is deleted. */
export function reconcileWorldTiming(p: Project, old: Project) {
  if (!p.realityTiming) return;
  const alive = new Set(p.units.filter(u => u.kind === 'beat').map(u => u.id));
  const deleted = old.units.filter(u => u.kind === 'beat' && !alive.has(u.id)).map(u => u.id);
  if (!deleted.length) return;
  const allIds = [...new Set([...alive, ...deleted])], prior = relationGraph(allIds, p.realityTiming.relations);
  const kept = p.realityTiming.relations.filter(r => alive.has(r.fromEventId) && alive.has(r.toEventId));
  const members = new Map([...prior.groups].map(([id, group]) => [id, group.filter(e => alive.has(e))]));
  const add = (kind: WorldRelation['kind'], fromEventId: string, toEventId: string) => {
    if (relationGraph([...alive], kept).compare(fromEventId, toEventId) === (kind === 'before' ? 'before' : 'same-time')) return;
    kept.push({ id: uid(), kind, fromEventId, toEventId, note: '刪除中間事件後，保留原本已確定的時序關係' });
  };
  for (const group of members.values()) for (const id of group.slice(1)) add('same-time', group[0], id);
  for (const [from, group] of members) {
    if (!group.length) continue;
    const seen = new Set<string>();
    const bridge = (at: string) => { if (seen.has(at)) return; seen.add(at); const target = members.get(at)!; if (target.length) add('before', group[0], target[0]); else for (const to of prior.edges.get(at) ?? []) bridge(to); };
    for (const to of prior.edges.get(from) ?? []) bridge(to);
  }
  p.realityTiming.relations = kept; invalidateWorldTiming(p);
}

/** Resolve a whole authored state without using drawing order as a tiebreaker. */
export function resolvePartialValue<T>(p: Project, target: string, changes: { eventId: string; value: T }[], initial: T, after = true): { value: T; eventId: string | null; unknown: boolean; multiple: boolean } {
  const relation = (id: string) => compareWorldEvents(p, id, target);
  const same = after ? changes.filter(c => relation(c.eventId) === 'same-time') : [];
  if (same.length) {
    const equal = same.every(c => JSON.stringify(c.value) === JSON.stringify(same[0].value));
    return { value: same[0].value, eventId: same.length === 1 ? same[0].eventId : null, unknown: !equal, multiple: same.length > 1 };
  }
  if (changes.some(c => relation(c.eventId) === 'unknown')) return { value: initial, eventId: null, unknown: true, multiple: false };
  const preceding = changes.filter(c => relation(c.eventId) === 'before');
  const latest = preceding.filter(c => !preceding.some(other => compareWorldEvents(p, c.eventId, other.eventId) === 'before'));
  if (!latest.length) return { value: initial, eventId: null, unknown: false, multiple: false };
  const equal = latest.every(c => JSON.stringify(c.value) === JSON.stringify(latest[0].value));
  return { value: latest[0].value, eventId: latest.length === 1 ? latest[0].eventId : null, unknown: !equal, multiple: latest.length > 1 };
}
export function partialCharacterState(p: Project, trackId: string, eventId: string, after: boolean) {
  const track = p.tracks.find(t => t.id === trackId)!;
  const changes = p.transitions.filter(t => t.trackId === trackId).map(t => ({ eventId: t.eventId, value: t.after }));
  const result = resolvePartialValue<Snapshot>(p, eventId, changes, track.initial, after);
  return { snapshot: result.unknown ? { ...emptySnapshot(), state: '時序未定' } : result.value, eventId: result.eventId,
    occurrenceId: result.eventId ? p.timelines.reality.placements.find(o => o.eventId === result.eventId)?.id ?? null : null,
    source: result.unknown ? '世界先後未定，或同時更新互相衝突；未沿用列表順序' : result.multiple ? '多個明確時序來源給出相同狀態；沒有指定單一可編輯前項' : result.eventId ? '依明確世界先後／同時關係解析的作者狀態' : '在明確時序上尚無較早更新，沿用作者開場設定',
    unresolved: result.unknown || result.multiple };
}
export function simultaneousStateWarnings(p: Project) {
  return sameTimeGroups(p).flatMap(group => p.tracks.filter(t => t.kind === 'character').flatMap(t => {
    const updates = p.transitions.filter(u => u.trackId === t.id && group.includes(u.eventId));
    return updates.length > 1 && updates.some(u => JSON.stringify(u.after) !== JSON.stringify(updates[0].after)) ? [`${t.name} 在同時事件中有不同狀態；請調整時序或這些明確更新`] : [];
  }));
}
