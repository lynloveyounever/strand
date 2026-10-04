import { clone, descendants, fields, uid, updateBlueprint, type Project, type Snapshot } from './model';
import { bases, type Occurrence, type TimeBasis } from './temporal';
import { emotionTypes, type Emotion } from './audience';
import { compareWorldEvents, resolvePartialValue } from './worldTiming';

export const trackDimensions = ['goal', 'growth', 'cognition', 'emotion', 'relationship', 'clue', 'ability', 'resources', 'obstacle', 'judgment', 'custom'] as const;
export type TrackDimension = typeof trackDimensions[number];
export const dimensionLabels: Record<TrackDimension, string> = { goal: '目標／渴望', growth: '成長', cognition: '認知', emotion: '情緒', relationship: '關係', clue: '伏筆／回收', ability: '能力', resources: '資源', obstacle: '阻礙', judgment: '判斷', custom: '自訂' };
export const epistemicLabels = { 'authored-fact': '作者設定的世界事實', 'self-belief': '人物對自身的認知', 'audience-belief': '觀眾的理解／判斷', 'intended-response': '作者期望的觀眾反應' };
export type Epistemic = keyof typeof epistemicLabels;
export type ContentOwner = { kind: 'character'; trackId: string } | { kind: 'relationship'; trackIds: [string, string] } | { kind: 'audience' } | { kind: 'custom'; label: string };
export type ContentAnchor = { kind: 'event'; eventId: string } | { kind: 'occurrence'; eventId: string; occurrenceId: string };
export type ContentSource = { kind: 'manual' } | { kind: 'snapshot'; field: keyof Snapshot } | { kind: 'audience-cognition'; field: 'knows' | 'believes' | 'questions' } | { kind: 'audience-emotion'; emotion: Emotion };
export type ContentEntry = { id: string; anchor: ContentAnchor; value: string | number | null; note: string; reveal?: ContentAnchor | null };
export type ContentTrack = { id: string; name: string; meaning: string; owner: ContentOwner; targetTrackId?: string; epistemic?: Epistemic; basis: TimeBasis; dimension: TrackDimension; representation: 'state' | 'number' | 'link'; scale?: { min: number; max: number; minLabel: string; maxLabel: string }; source: ContentSource; entries: ContentEntry[]; example?: true };
export type TrackSample = { index: number; occurrenceId: string; eventId: string; value: string | number | null; explicit: boolean; inherited: boolean; sourceAnchor: ContentAnchor | null; note: string; reveal?: ContentAnchor | null; entryId?: string; provenance: string };
export const ownerKey = (owner: ContentOwner) => owner.kind === 'character' ? 'character:' + owner.trackId : owner.kind === 'relationship' ? 'relationship:' + [...owner.trackIds].sort().join('|') : owner.kind === 'audience' ? 'audience' : 'custom:' + owner.label;
export function ownerLabel(p: Project, owner: ContentOwner) { return owner.kind === 'character' ? p.tracks.find(t => t.id === owner.trackId)?.name ?? '已移除人物' : owner.kind === 'relationship' ? owner.trackIds.map(id => p.tracks.find(t => t.id === id)?.name ?? '已移除人物').join(' ↔ ') : owner.kind === 'audience' ? '觀眾' : owner.label; }
export const anchorKey = (anchor: ContentAnchor) => anchor.kind === 'event' ? anchor.eventId : anchor.occurrenceId;
export const contentAnchor = (basis: TimeBasis, item: Occurrence): ContentAnchor => basis === 'reality' ? { kind: 'event', eventId: item.eventId } : { kind: 'occurrence', eventId: item.eventId, occurrenceId: item.id };
export function targetLabel(p: Project, track: ContentTrack) { return track.targetTrackId ? p.tracks.find(t => t.id === track.targetTrackId)?.name ?? '已移除人物' : ''; }
export function sourceLabel(track: ContentTrack) { const source = track.source; return source.kind === 'manual' ? '作者直接設定' : source.kind === 'snapshot' ? '沿用已有文字快照' : source.kind === 'audience-cognition' ? '沿用此理解節點的認知設定' : '沿用此理解節點的作者情緒值'; }
export function newContentTrack(basis: TimeBasis = 'narrative', dimension: TrackDimension = 'custom'): ContentTrack {
  return { id: uid(), name: dimension === 'custom' ? '未命名追蹤' : dimensionLabels[dimension], meaning: '', owner: { kind: 'custom', label: '故事' }, basis, dimension, representation: dimension === 'clue' ? 'link' : dimension === 'emotion' ? 'number' : 'state', ...(dimension === 'emotion' ? { scale: { min: 0, max: 100, minLabel: '低', maxLabel: '高' } } : {}), source: { kind: 'manual' }, entries: [] };
}
function changed(p: Project) { updateBlueprint(p, p.units.find(u => u.kind === 'story')!.id); }
export function saveContentTrack(p: Project, track: ContentTrack) {
  const list = p.storyTracks ?? [], previous = list.find(t => t.id === track.id);
  if (previous && JSON.stringify(previous) === JSON.stringify(track)) return;
  if (previous?.entries.length && (previous.basis !== track.basis || previous.representation !== track.representation || JSON.stringify(previous.source) !== JSON.stringify(track.source))) throw new Error('已有更新時請保留時間依據、資料來源與資料形式；可建立另一條追蹤');
  if (previous) list[list.indexOf(previous)] = clone(track); else list.push(clone(track));
  p.storyTracks = list; validateStoryTracks(p); changed(p);
}
export function removeContentTrack(p: Project, id: string) { if (!p.storyTracks?.some(t => t.id === id)) return; p.storyTracks = p.storyTracks.filter(t => t.id !== id); changed(p); }
export function setContentEntry(p: Project, trackId: string, entry: ContentEntry) {
  const track = p.storyTracks?.find(t => t.id === trackId); if (!track) throw new Error('找不到這條追蹤');
  if (track.source.kind !== 'manual') throw new Error('此追蹤沿用已有資料，請編輯原本的作者設定');
  const index = track.entries.findIndex(e => anchorKey(e.anchor) === anchorKey(entry.anchor));
  const next = clone(entry); if (index >= 0) { next.id = track.entries[index].id; if (JSON.stringify(track.entries[index]) === JSON.stringify(next)) return; track.entries[index] = next; } else track.entries.push(next);
  validateStoryTracks(p); changed(p);
}
export function removeContentEntry(p: Project, trackId: string, entryId: string) { const t = p.storyTracks?.find(t => t.id === trackId); if (!t?.entries.some(e => e.id === entryId)) return; t.entries = t.entries.filter(e => e.id !== entryId); changed(p); }

/** Manual state values are categorical updates. Numeric missing values never carry or become zero. */
export function contentSeries(p: Project, track: ContentTrack): TrackSample[] {
  const list = p.timelines[track.basis].placements, source = track.source;
  if (source.kind === 'snapshot' && track.basis === 'narrative') {
    const world = new Map(contentSeries(p, { ...track, basis: 'reality' }).map(sample => [sample.eventId, sample]));
    return list.map((item, index) => { const mapped = world.get(item.eventId); return { index, occurrenceId: item.id, eventId: item.eventId, value: mapped?.value ?? null, explicit: mapped?.explicit ?? false, inherited: mapped?.inherited ?? false, sourceAnchor: mapped?.sourceAnchor ?? null, note: '', provenance: mapped ? '對應事件的世界快照（非觀眾已知） · ' + mapped.provenance : '缺少世界位置，沒有推定人物狀態' }; });
  }
  const entries = new Map(track.entries.map(e => [anchorKey(e.anchor), e]));
  let value: string | number | null = null, sourceAnchor: ContentAnchor | null = null, provenance = '尚未設定', inherited = false;
  const owner = track.owner;
  const perspective = owner.kind === 'character' ? p.tracks.find(t => t.id === owner.trackId) : undefined;
  const realityRecords = source.kind === 'snapshot' && perspective ? p.transitions.filter(t => t.trackId === perspective.id) : [];
  if (source.kind === 'snapshot' && track.basis === 'reality' && perspective) { value = meaningful(perspective.initial[source.field]); provenance = '人物開場文字設定'; }
  return list.map((item, index) => {
    const anchor = contentAnchor(track.basis, item), entry = entries.get(anchorKey(anchor));
    let explicit = false, note = '', reveal: ContentAnchor | null | undefined, entryId: string | undefined;
    if (source.kind === 'manual') {
      if (track.representation !== 'state') { value = null; sourceAnchor = null; provenance = '此節點未填寫'; }
      if (entry) { value = entry.value; sourceAnchor = entry.anchor; note = entry.note; reveal = entry.reveal; entryId = entry.id; provenance = entry.value === null ? '作者明確標為未知' : '作者直接設定'; explicit = true; }
      inherited = !entry && sourceAnchor !== null;
      if (track.basis === 'reality' && p.realityTiming && track.representation === 'state') {
        const resolved = resolvePartialValue(p, item.eventId, track.entries.map(e => ({ eventId: e.anchor.eventId, value: e.value })), null);
        value = resolved.unknown ? null : resolved.value; sourceAnchor = resolved.eventId ? { kind: 'event', eventId: resolved.eventId } : null;
        inherited = !entry && sourceAnchor !== null; provenance = resolved.unknown ? '先後未定或同時值衝突，狀態未知' : entry ? provenance : resolved.multiple ? '多個明確來源值相同' : inherited ? '依明確世界時序沿用' : '尚未設定';
      }
    } else if (source.kind === 'snapshot') {
      const update = track.basis === 'reality' ? realityRecords.find(t => t.eventId === item.eventId) : item.updates.find(t => t.trackId === perspective?.id);
      if (update) { value = meaningful(update.after[source.field]); sourceAnchor = anchor; explicit = true; provenance = '此節點明確寫下的文字快照'; }
      inherited = !explicit && sourceAnchor !== null;
      if (track.basis === 'reality' && p.realityTiming && perspective) {
        const resolved = resolvePartialValue(p, item.eventId, realityRecords.map(t => ({ eventId: t.eventId, value: meaningful(t.after[source.field]) })), meaningful(perspective.initial[source.field]));
        value = resolved.unknown ? null : resolved.value; sourceAnchor = resolved.eventId ? { kind: 'event', eventId: resolved.eventId } : null; inherited = !explicit && !!sourceAnchor;
        provenance = resolved.unknown ? '先後未定或同時值衝突，狀態未知' : resolved.multiple ? '多個明確來源值相同' : sourceAnchor ? '依明確世界時序的文字快照' : '人物開場文字設定';
      }
    } else {
      value = source.kind === 'audience-cognition' ? meaningful(item.audienceDesign?.cognition[source.field]) : item.audienceDesign?.emotions[source.emotion] ?? null;
      explicit = source.kind === 'audience-cognition' ? item.audienceDesign !== undefined : value !== null;
      inherited = false; sourceAnchor = explicit ? anchor : null; provenance = explicit ? '此理解節點的作者設定；非推導、非實測' : '此理解節點尚未填寫';
    }
    return { index, occurrenceId: item.id, eventId: item.eventId, value, explicit, inherited, sourceAnchor: clone(sourceAnchor), note, reveal, entryId, provenance };
  });
}
function meaningful(value?: string) { return value?.trim() && value !== 'Unstated' ? value : null; }
export function contentNumberSegments(series: TrackSample[], p?: Project, track?: ContentTrack) {
  return series.slice(1).flatMap((to, i) => { const from = series[i]; return typeof from.value === 'number' && typeof to.value === 'number' && (!p?.realityTiming || track?.basis !== 'reality' || compareWorldEvents(p, from.eventId, to.eventId) === 'before') ? [{ from, to }] : []; });
}
export function visibleContentTracks(p: Project, filter: { owner?: string; dimension?: string; hiddenIds?: string[] }, basis?: TimeBasis) {
  const tracks = p.storyTracks ?? [], owner = tracks.some(t => ownerKey(t.owner) === filter.owner) ? filter.owner : 'all', dimension = tracks.some(t => t.dimension === filter.dimension) ? filter.dimension : 'all';
  return tracks.filter(t => (!basis || t.basis === basis) && (!owner || owner === 'all' || ownerKey(t.owner) === owner) && (!dimension || dimension === 'all' || t.dimension === dimension) && !filter.hiddenIds?.includes(t.id));
}
export function contentOwnerReferences(owner: ContentOwner) { return owner.kind === 'character' ? [owner.trackId] : owner.kind === 'relationship' ? owner.trackIds : []; }
export function reconcileStoryTracks(p: Project, old: Project) {
  if (!p.storyTracks) return;
  const before = JSON.stringify(p.storyTracks);
  const deletedEvents = new Set(old.units.filter(u => u.kind === 'beat' && !p.units.some(n => n.id === u.id)).map(u => u.id));
  const deletedOccurrences = new Set(bases.flatMap(b => old.timelines[b].placements.filter(o => !p.timelines[b].placements.some(n => n.id === o.id)).map(o => o.id)));
  const deletedOwners = new Set(old.tracks.filter(t => !p.tracks.some(n => n.id === t.id)).map(t => t.id));
  const removed = (a: ContentAnchor) => deletedEvents.has(a.eventId) || (a.kind === 'occurrence' && deletedOccurrences.has(a.occurrenceId));
  p.storyTracks = p.storyTracks.filter(t => !contentOwnerReferences(t.owner).some(id => deletedOwners.has(id)) && (!t.targetTrackId || !deletedOwners.has(t.targetTrackId)));
  for (const track of p.storyTracks) { track.entries = track.entries.filter(e => !removed(e.anchor)); for (const e of track.entries) if (e.reveal && removed(e.reveal)) e.reveal = null; }
  if (JSON.stringify(p.storyTracks) !== before) changed(p);
}
export function validateStoryTracks(p: Project) {
  if (p.storyTracks === undefined) return;
  const fail = (message = 'content tracking data') => { throw new Error('Invalid project: ' + message); };
  const str = (x: unknown, max = 20000) => typeof x === 'string' && x.length <= max;
  const id = (x: unknown) => str(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x as string) && !['__proto__', 'constructor', 'prototype'].includes(x as string);
  if (!Array.isArray(p.storyTracks) || p.storyTracks.length > 48) fail('最多 48 條內容追蹤');
  const ids = new Set<string>(), entryIds = new Set<string>();
  for (const t of p.storyTracks) {
    if (!t || !id(t.id) || ids.has(t.id) || !str(t.name, 300) || !t.name.trim() || !str(t.meaning) || !bases.includes(t.basis) || !trackDimensions.includes(t.dimension) || !['state', 'number', 'link'].includes(t.representation) || !Array.isArray(t.entries) || t.entries.length > 3000 || (t.example !== undefined && t.example !== true)) fail();
    ids.add(t.id);
    if (!t.owner || typeof t.owner !== 'object') fail('追蹤缺少所屬對象');
    const o = t.owner;
    if (o.kind === 'character' || o.kind === 'relationship') {
      if (o.kind === 'relationship' && (!Array.isArray(o.trackIds) || o.trackIds.length !== 2 || o.trackIds[0] === o.trackIds[1])) fail('關係追蹤需要兩個不同人物');
      if (contentOwnerReferences(o).some(x => !p.tracks.some(existing => existing.id === x && existing.kind === 'character'))) fail('人物仍被內容追蹤引用；請先調整所屬人物，再變更視角類型');
    } else if (o.kind === 'custom') { if (!str(o.label, 300) || !o.label.trim()) fail('自訂對象需要名稱'); }
    else if (o.kind !== 'audience') fail('unknown content owner');
    if (t.targetTrackId !== undefined && (!id(t.targetTrackId) || !p.tracks.some(x => x.id === t.targetTrackId && x.kind === 'character') || !['character', 'audience'].includes(o.kind))) fail('觀察對象需要一個存在的人物，以及人物或觀眾視角');
    if (t.epistemic !== undefined && !Object.keys(epistemicLabels).includes(t.epistemic)) fail('未知的事實／認知來源');
    if (t.epistemic === 'authored-fact' && o.kind === 'audience') fail('觀眾判斷需與作者世界事實分开標示');
    if (t.epistemic === 'self-belief' && (o.kind !== 'character' || (t.targetTrackId && t.targetTrackId !== o.trackId))) fail('自我認知的對象必須是人物自己');
    if ((t.epistemic === 'audience-belief' || t.epistemic === 'intended-response') && o.kind !== 'audience') fail('觀眾判斷與期望反應需要觀眾視角');
    if (t.representation === 'number') {
      if (!t.scale || !Number.isFinite(t.scale.min) || !Number.isFinite(t.scale.max) || t.scale.min >= t.scale.max || !str(t.scale.minLabel, 300) || !t.scale.minLabel.trim() || !str(t.scale.maxLabel, 300) || !t.scale.maxLabel.trim() || !t.meaning.trim()) fail('數值追蹤需要有效範圍、兩端含義及數值說明');
    } else if (t.scale !== undefined) fail('只有數值追蹤可設定刻度');
    if (!t.source || typeof t.source !== 'object') fail();
    const s = t.source;
    if (s.kind === 'snapshot') { if (o.kind !== 'character' || t.representation !== 'state' || !fields.includes(s.field)) fail('文字快照來源與人物／資料形式不符'); }
    else if (s.kind === 'audience-cognition' || s.kind === 'audience-emotion') {
      if (o.kind !== 'audience' || t.basis !== 'audience') fail('觀眾設計來源只屬於觀眾理解節點');
      if (s.kind === 'audience-cognition' && (t.representation !== 'state' || !['knows', 'believes', 'questions'].includes(s.field))) fail();
      if (s.kind === 'audience-emotion' && (t.representation !== 'number' || !emotionTypes.includes(s.emotion) || t.scale?.min !== 0 || t.scale.max !== 100)) fail('已有觀眾情緒值使用固定 0–100 刻度');
    } else if (s.kind !== 'manual') fail();
    if (s.kind !== 'manual' && t.entries.length) fail('來源綁定追蹤不能同時存放手動值');
    const checkAnchor = (a: ContentAnchor) => {
      if (!a || !id(a.eventId) || !p.units.some(u => u.kind === 'beat' && u.id === a.eventId)) fail('追蹤參照不存在的事件');
      if (t.basis === 'reality') { if (a.kind !== 'event') fail('世界追蹤以共用事件定位'); }
      else if (a.kind !== 'occurrence' || !id(a.occurrenceId) || !p.timelines[t.basis].placements.some(item => item.id === a.occurrenceId && item.eventId === a.eventId)) fail('追蹤必須指向同一順序中的確切呈現與事件');
    };
    const anchors = new Set<string>();
    for (const e of t.entries) {
      if (!e || !id(e.id) || entryIds.has(e.id) || !str(e.note)) fail();
      entryIds.add(e.id); checkAnchor(e.anchor);
      if (anchors.has(anchorKey(e.anchor))) fail('同一追蹤節點只能有一筆更新'); anchors.add(anchorKey(e.anchor));
      if (e.value !== null && (t.representation === 'number' ? typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value < t.scale!.min || e.value > t.scale!.max : !str(e.value) || !(e.value as string).trim())) fail('追蹤值不符合資料形式或刻度');
      if (t.representation === 'link') { if (e.reveal !== undefined && e.reveal !== null) { checkAnchor(e.reveal); if (anchorKey(e.reveal) === anchorKey(e.anchor) || e.value === null) fail('回收需指向另一個明確節點，並填寫線索'); } }
      else if (e.reveal !== undefined) fail('只有連結追蹤可指定回收');
    }
  }
}
export function captureContentTracks(p: Project, unitId: string) {
  const eventIds = new Set([unitId, ...descendants(p, unitId).map(u => u.id)]);
  return (p.storyTracks ?? []).map(track => ({ ...clone(track), ownerName: ownerLabel(p, track.owner), entries: track.entries.filter(e => eventIds.has(e.anchor.eventId)), frozenValues: contentSeries(p, track).filter(s => eventIds.has(s.eventId)) }));
}
