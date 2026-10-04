import { clone, setTransition, type Project, type Transition } from './model';
import { audienceReadingUpdate, readingContext } from './storyReading';
import { emptyAudienceDesign, type AudienceDesign } from './audience';
import { patchOccurrence, type Occurrence, type TimeBasis } from './temporal';
import { compareWorldEvents } from './worldTiming';

export function eventNeighborhood(p: Project, eventId: string) {
  const event = p.units.find(u => u.id === eventId);
  const cause = p.units.find(u => u.id === event?.storyLogic?.causeEventId);
  const consequences = p.units.filter(u => u.kind === 'beat' && u.storyLogic?.causeEventId === eventId);
  const related = new Set([eventId, ...(cause ? [cause.id] : []), ...consequences.map(u => u.id)]);
  return { cause, consequences, related, characters: p.tracks.filter(t => t.kind === 'character' && p.transitions.some(x => x.trackId === t.id && x.eventId === eventId)) };
}
export function eventRelation(p: Project, selectedId: string, eventId: string) {
  const n = eventNeighborhood(p, selectedId);
  return eventId === selectedId ? 'selected' : n.cause?.id === eventId ? 'cause' : n.consequences.some(u => u.id === eventId) ? 'consequence' : 'context';
}
export function authoredAudienceDesign(p: Project, o: Occurrence): AudienceDesign {
  const legacy = audienceReadingUpdate(p, o);
  return clone(o.audienceDesign ?? { ...emptyAudienceDesign(), cognition: { knows: o.knowledgeNote || legacy?.after.knowledge || '', believes: legacy?.interpretation || '', questions: '' } });
}
export function editInlineAudience(p: Project, id: string, change: (d: AudienceDesign) => void) {
  const o = p.timelines.audience.placements.find(o => o.id === id);
  if (!o) throw new Error('找不到這個理解節點');
  const d = authoredAudienceDesign(p, o); change(d); patchOccurrence(p, 'audience', id, { audienceDesign: d });
}
export function setMotivationDependency(p: Project, eventId: string, trackId: string, enabled: boolean) {
  const t = p.transitions.find(t => t.eventId === eventId && t.trackId === trackId);
  if (!t) throw new Error('先寫下人物在此事件的選擇');
  const next = clone(t);
  if (enabled) {
    const o = p.timelines.reality.placements.find(o => o.eventId === eventId);
    const c = o && readingContext(p, o, 'reality').characters.find(c => c.track.id === trackId);
    if (!c?.before || c.beforeUnresolved) throw new Error('動機來源未定，請先釐清世界時序');
    next.motivationSource = { eventId: c.beforeSourceEventId ?? null };
  } else delete next.motivationSource;
  setTransition(p, next);
}
export type StoryCheck = { id: string; eventId: string; occurrenceId?: string; sourceEventId?: string; status: 'warning' | 'unknown' | 'verified'; title: string; detail: string };
function motivationCheck(p: Project, t: Transition): StoryCheck | undefined {
  if (!t.motivationSource) return;
  const name = p.tracks.find(c => c.id === t.trackId)?.name || '人物';
  const sourceId = t.motivationSource.eventId;
  const source = sourceId === null ? p.tracks.find(c => c.id === t.trackId)?.initial : p.transitions.find(c => c.trackId === t.trackId && c.eventId === sourceId)?.after;
  const base = { id: `motivation:${t.eventId}:${t.trackId}`, eventId: t.eventId, sourceEventId: sourceId ?? undefined };
  const label = sourceId === null ? '開場設定' : `〈${p.units.find(u => u.id === sourceId)?.title || '已刪除事件'}〉之後的設定`;
  if (!t.reaction.trim()) return { ...base, status: 'unknown', title: `${name}的選擇尚未寫下`, detail: `已有指向${label}的動機依賴，但選擇內容目前空白；可補寫或解除連結。` };
  if (!source?.motivation.trim()) return { ...base, status: 'warning', title: `${name}的選擇缺少已指定的動機`, detail: `這個選擇明確依賴${label}，但該動機目前空白或來源已移除。選擇：${t.reaction || '尚未寫下'}` };
  if (sourceId !== null && compareWorldEvents(p, sourceId, t.eventId) !== 'before') return { ...base, status: compareWorldEvents(p, sourceId, t.eventId) === 'unknown' ? 'unknown' : 'warning', title: `${name}的動機先後需要確認`, detail: `${label}未能確定早於這個選擇；不以列表距離推測。` };
  const o = p.timelines.reality.placements.find(o => o.eventId === t.eventId);
  const c = o && readingContext(p, o, 'reality').characters.find(c => c.track.id === t.trackId);
  if (!c || c.beforeUnresolved || c.beforeSourceEventId !== sourceId) return { ...base, status: 'unknown', title: `${name}的動機來源已不同`, detail: `依賴仍指向${label}；目前世界前項不同或未定，請重新確認這個連結。` };
  return { ...base, status: 'verified', title: `${name}的選擇有明確動機來源`, detail: `${label}：${source.motivation}` };
}
/** Checks explicit links only. Text similarity, proximity and numeric emotion are not evidence. */
export function storyChecks(p: Project): StoryCheck[] {
  const checks: StoryCheck[] = [];
  for (const u of p.units.filter(u => u.kind === 'beat' && u.storyLogic?.causeEventId)) {
    const sourceId = u.storyLogic!.causeEventId!;
    const relation = compareWorldEvents(p, sourceId, u.id);
    checks.push({ id: `cause:${u.id}`, eventId: u.id, sourceEventId: sourceId, status: relation === 'before' ? 'verified' : relation === 'unknown' ? 'unknown' : 'warning', title: relation === 'before' ? '原因事件早於結果' : relation === 'unknown' ? '因果的世界先後未定' : '原因事件沒有早於結果', detail: `明確連結：〈${p.units.find(x => x.id === sourceId)?.title}〉 → 〈${u.title}〉。${relation === 'unknown' ? '尚無足夠時序資料。' : relation === 'before' ? '只確認先後，不判定因果合理性。' : '請確認世界順序或這個因果連結。'}` });
  }
  for (const t of p.transitions) { const c = motivationCheck(p, t); if (c) checks.push(c); }
  const list = p.timelines.audience.placements;
  list.forEach((o, index) => o.audienceDesign?.requiredEarlierIds?.forEach(id => {
    const at = list.findIndex(x => x.id === id); const source = list[at];
    checks.push({ id: `reveal:${o.id}:${id}`, eventId: o.eventId, occurrenceId: o.id, sourceEventId: source?.eventId, status: at < 0 ? 'unknown' : at < index ? 'verified' : 'warning', title: at >= 0 && at < index ? '理解所依據的資訊已先安排' : '理解依據尚未出現', detail: `理解節點 ${index + 1} 明確依賴${at < 0 ? '已移除的節點' : `節點 ${at + 1}〈${p.units.find(u => u.id === source.eventId)?.title}〉`}。這只比較觀眾理解順序，不等於人物知道。` });
  }));
  return checks;
}
export type EditImpact = { id: string; eventId: string; text: string };
export function editImpacts(before: Project | undefined, after: Project): EditImpact[] {
  if (!before) return [];
  const impacts: EditImpact[] = [];
  const basisLabels: Record<TimeBasis, string> = { reality: '世界閱讀位置', narrative: '呈現位置', audience: '觀眾理解位置' };
  for (const basis of ['reality', 'narrative', 'audience'] as const) {
    const old = before.timelines[basis].placements, next = after.timelines[basis].placements;
    // Addition/deletion is not reported as a reorder of every surviving item.
    const shared = new Set(old.filter(o => next.some(n => n.id === o.id)).map(o => o.id));
    const a = old.filter(o => shared.has(o.id)), b = next.filter(o => shared.has(o.id));
    for (const [i, o] of b.entries()) {
      const previous = a.findIndex(x => x.id === o.id);
      if (previous === i) continue;
      impacts.push({ id: `order:${basis}:${o.id}`, eventId: o.eventId, text: `〈${after.units.find(u => u.id === o.eventId)?.title}〉${basisLabels[basis]}：${old.findIndex(x => x.id === o.id) + 1} → ${next.findIndex(x => x.id === o.id) + 1}${basis === 'reality' && after.realityTiming ? '（世界關係未因此改寫）' : ''}` });
    }
  }
  const stateInputs = (p: Project) => JSON.stringify({ order: p.timelines.reality.placements.map(o => o.eventId), relations: p.realityTiming, transitions: p.transitions.map(t => [t.eventId, t.trackId, t.after]), openings: p.tracks.filter(t => t.kind === 'character').map(t => [t.id, t.initial]) });
  if (stateInputs(before) !== stateInputs(after)) for (const o of after.timelines.reality.placements) {
    const old = before.timelines.reality.placements.find(x => x.id === o.id);
    if (!old) continue;
    const a = readingContext(before, old, 'reality'), b = readingContext(after, o, 'reality');
    for (const c of b.characters.filter(c => c.transition)) {
      const previous = a.characters.find(x => x.track.id === c.track.id);
      if (!previous) continue;
      if (previous.beforeUnresolved !== c.beforeUnresolved || previous.beforeSourceEventId !== c.beforeSourceEventId || previous.before?.knowledge !== c.before?.knowledge || previous.before?.goal !== c.before?.goal) impacts.push({ id: `state:${o.id}:${c.track.id}`, eventId: o.eventId, text: `〈${b.event.title}〉${c.track.name}的事件前知情／目標內容或來源已變更：${c.beforeUnresolved ? '未定' : c.beforeSourceEventId ? `〈${after.units.find(u => u.id === c.beforeSourceEventId)?.title}〉` : '開場設定'}。人物明寫的事件後狀態仍保留` });
    }
  }
  const oldChecks = new Map(storyChecks(before).map(c => [c.id, c]));
  for (const c of storyChecks(after)) if (oldChecks.has(c.id) && (oldChecks.get(c.id)!.status !== c.status || (c.id.startsWith('motivation:') && oldChecks.get(c.id)!.detail !== c.detail))) impacts.push({ id: c.id, eventId: c.eventId, text: `${c.title}。${c.detail}` });
  for (const o of before.timelines.audience.placements) for (const e of o.audienceDesign?.expectations ?? []) {
    const next = after.timelines.audience.placements.find(x => x.id === o.id)?.audienceDesign?.expectations.find(x => x.id === e.id);
    if (e.responseId && next && !next.responseId) {
      const list = after.timelines.audience.placements, sourceAt = list.findIndex(x => x.id === o.id), responseAt = list.findIndex(x => x.id === e.responseId);
      const invalid = responseAt < 0 || responseAt <= sourceAt;
      impacts.push({ id: `expectation:${e.id}`, eventId: o.eventId, text: `預期「${e.text}」${invalid ? '的回應位置已失效，已回到「尚未回應」；請重新指定更後面的理解節點' : '的回應連結已解除，目前為「尚未回應」'}` });
    }
  }
  for (const u of before.units) {
    const next = after.units.find(n => n.id === u.id);
    if (u.storyLogic?.causeEventId && next && !next.storyLogic?.causeEventId) impacts.push({ id: `unlinked-cause:${u.id}`, eventId: u.id, text: `〈${u.title}〉的原因事件連結已移除；原因文字仍保留，若需要請重新指定來源` });
  }
  return impacts;
}
