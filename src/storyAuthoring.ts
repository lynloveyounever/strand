import { addUnit, children, clone, editUnit, setTransition, uid, updateBlueprint, type Project, type Snapshot, type StoryCraft, type Unit } from './model';
import { audienceReadingUpdate, readingContext } from './storyReading';
import { emptyAudienceDesign } from './audience';
import { bases, patchOccurrence } from './temporal';

/** All guidance is optional authored text. No completeness score or inferred psychology. */
export function editStoryContext(p: Project, patch: Partial<Pick<Project, 'title' | 'premise' | 'themeQuestion'>>) {
  if (Object.entries(patch).every(([key, value]) => p[key as keyof typeof patch] === value)) return;
  Object.assign(p, patch);
  const root = p.units.find(u => u.kind === 'story')!;
  if (patch.title !== undefined) root.title = patch.title;
  updateBlueprint(p, root.id);
}
export function editCraft(p: Project, id: string, patch: Partial<StoryCraft>) {
  const unit = p.units.find(u => u.id === id);
  if (!unit) throw new Error('找不到這一場或事件');
  editUnit(p, id, { craft: { opposition: '', turn: '', ...unit.craft, ...patch } });
}
export function editStoryLogic(p: Project, id: string, patch: Partial<NonNullable<Unit['storyLogic']>>) {
  const unit = p.units.find(u => u.id === id);
  if (!unit) throw new Error('找不到這一場或事件');
  editUnit(p, id, { storyLogic: { cause: '', outcome: '', ...unit.storyLogic, ...patch } });
}
/** Insert only the new event near this scene. Existing order on every basis is retained. */
export function addStoryUnit(p: Project, sceneId: string, kind: 'scene' | 'beat') {
  const scene = p.units.find(u => u.id === sceneId && u.kind === 'scene');
  if (!scene) throw new Error('請先選擇一場');
  const previous = kind === 'beat' ? children(p, scene.id).at(-1)?.id : undefined;
  const added = addUnit(p, kind === 'scene' ? scene.parentId! : scene.id)!;
  const newScene = kind === 'scene' ? p.units.find(u => u.id === added)! : scene;
  const event = kind === 'scene' ? children(p, added)[0] : p.units.find(u => u.id === added)!;
  if (kind === 'scene') newScene.title = `第 ${p.units.filter(u => u.kind === 'scene').length} 場`;
  event.title = `事件 ${p.units.filter(u => u.kind === 'beat').length}`;
  if (previous) for (const basis of bases) {
    const list = p.timelines[basis].placements;
    const item = list.find(o => o.eventId === event.id)!;
    const anchor = list.map(o => o.eventId).lastIndexOf(previous);
    if (anchor < 0) continue;
    const rest = list.filter(o => o.id !== item.id);
    const at = rest.map(o => o.eventId).lastIndexOf(previous);
    rest.splice(at + 1, 0, item);
    p.timelines[basis].placements = rest;
  }
  return event.id;
}
export function addStoryCharacter(p: Project, name: string) {
  const id = uid();
  const initial: Snapshot = { state: '', knowledge: '', goal: '', obstacle: '', motivation: '' };
  p.tracks.push({ id, name: name.trim() || '未命名人物', kind: 'character', color: '#bcbcbc', description: '', initial });
  updateBlueprint(p, p.units.find(u => u.kind === 'story')!.id);
  return id;
}
export function editCharacterOpening(p: Project, trackId: string, patch: Partial<Snapshot>) {
  const track = p.tracks.find(t => t.id === trackId && t.kind === 'character');
  if (!track) throw new Error('找不到這個人物');
  Object.assign(track.initial, patch);
  updateBlueprint(p, p.units.find(u => u.kind === 'story')!.id);
}
export function editChoiceTheme(p: Project, eventId: string, trackId: string, value: string) {
  const existing = p.transitions.find(t => t.eventId === eventId && t.trackId === trackId);
  if (existing?.themeLink === value || (!existing && !value.trim())) return;
  if (!existing) throw new Error('先寫下這個人物在此事件的選擇，再連結主題');
  setTransition(p, { ...clone(existing), themeLink: value });
}

export function editCharacterEffect(p: Project, eventId: string, trackId: string, field: keyof Snapshot, value: string) {
  const existing = p.transitions.find(t => t.eventId === eventId && t.trackId === trackId);
  if (existing?.after[field] === value || (!existing && !value.trim())) return;
  const item = p.timelines.reality.placements.find(o => o.eventId === eventId);
  const context = item && readingContext(p, item, 'reality').characters.find(c => c.track.id === trackId);
  if (!existing && (!context?.before || context.beforeUnresolved)) throw new Error('人物前項未定，請先釐清時序或明確填寫完整更新');
  const transition = existing ? clone(existing) : { eventId, trackId, interpretation: '', reaction: '', after: clone(context!.before!) };
  transition.after[field] = value;
  setTransition(p, transition);
}
export function editAudienceUnderstanding(p: Project, occurrenceId: string, field: 'knows' | 'believes' | 'questions', value: string) {
  const o = p.timelines.audience.placements.find(o => o.id === occurrenceId);
  if (!o) throw new Error('找不到這個理解節點');
  const legacy = audienceReadingUpdate(p, o);
  const design = o.audienceDesign ?? { ...emptyAudienceDesign(), cognition: { knows: o.knowledgeNote || legacy?.after.knowledge || '', believes: legacy?.interpretation || '', questions: '' } };
  if (design.cognition[field] === value) return;
  patchOccurrence(p, 'audience', o.id, { audienceDesign: { ...design, cognition: { ...design.cognition, [field]: value } } });
}

export type BlueprintEntry = { key: string; unit: Unit; scene: Unit; occurrenceNote?: string };
export function blueprintEntries(p: Project, order: 'structure' | 'narrative' = 'structure'): BlueprintEntry[] {
  if (order === 'narrative') return p.timelines.narrative.placements.map(o => ({ key: o.id, unit: p.units.find(u => u.id === o.eventId)!, scene: p.units.find(u => u.id === o.containerId)!, occurrenceNote: o.note }));
  const walk = (id: string): Unit[] => children(p, id).flatMap(u => u.kind === 'beat' ? [u] : walk(u.id));
  const root = p.units.find(u => u.kind === 'story')!;
  return walk(root.id).map(unit => ({ key: unit.id, unit, scene: p.units.find(u => u.id === unit.parentId)! }));
}
export function readableBlueprint(p: Project, order: 'structure' | 'narrative' = 'structure') {
  const out = [p.title || '未命名故事', `故事藍圖 · ${order === 'structure' ? '場與事件的結構順序' : '呈現順序（重複呈現會保留）'}`, '', p.premise || '（構想尚未寫下）'];
  if (p.themeQuestion?.trim()) out.push('', `想探問的問題：${p.themeQuestion}`);
  const characters = p.tracks.filter(t => t.kind === 'character');
  if (characters.length) out.push('', '人物', ...characters.flatMap(t => [t.name, ...(['goal', 'obstacle', 'motivation'] as const).filter(k => t.initial[k]?.trim()).map(k => `  ${{ goal: '開場想要', obstacle: '開場阻礙', motivation: '推動他的需要' }[k]}：${t.initial[k]}`)]));
  let previousScene = '';
  for (const { unit, scene, occurrenceNote } of blueprintEntries(p, order)) {
    if (scene.id !== previousScene) {
      out.push('', `【${scene.title || '未命名場'}】`);
      if (scene.summary) out.push(scene.summary);
      for (const [label, text] of [['場的目標', scene.intent], ['對抗／阻力', scene.craft?.opposition], ['轉折／改變', scene.craft?.turn], ['離場結果', scene.storyLogic?.outcome]]) if (text?.trim()) out.push(`${label}：${text}`);
      previousScene = scene.id;
    }
    out.push('', `· ${unit.title || '未命名事件'}`, unit.summary || '（事件內容尚未寫下）');
    const plots = p.narrativeLines?.filter(l => l.eventIds.includes(unit.id)).map(l => l.title);
    if (plots?.length) out.push(`  故事線：${plots.join('／')}`);
    for (const [label, text] of [['原因', unit.storyLogic?.cause], ['結果', unit.storyLogic?.outcome], ['這次呈現', occurrenceNote]]) if (text?.trim()) out.push(`  ${label}：${text}`);
    if (unit.storyLogic?.causeEventId) out.push(`  原因承接：${p.units.find(u => u.id === unit.storyLogic?.causeEventId)?.title || '未命名事件'}`);
    for (const t of p.transitions.filter(t => t.eventId === unit.id && p.tracks.some(c => c.id === t.trackId && c.kind === 'character'))) {
      const name = p.tracks.find(c => c.id === t.trackId)!.name;
      if (t.motivationSource) out.push(`  ${name} · 選擇明確依賴的動機來源：${t.motivationSource.eventId === null ? '開場設定' : p.units.find(u => u.id === t.motivationSource!.eventId)?.title || '來源已移除'}`);
      for (const [label, text] of [['理解', t.interpretation], ['選擇／反應', t.reaction], ['與主題的關係', t.themeLink]]) if (text?.trim()) out.push(`  ${name} · ${label}：${text}`);
      for (const [label, text] of [['狀態', t.after.state], ['知道', t.after.knowledge], ['想要', t.after.goal]]) if (text?.trim() && text !== 'Unstated') out.push(`  ${name} · 後續${label}（已保存，含沿用）：${text}`);
    }
  }
  const understanding = p.timelines.audience.placements.flatMap((o, index) => {
    const legacy = audienceReadingUpdate(p, o);
    const cognition = o.audienceDesign?.cognition ?? { knows: o.knowledgeNote || legacy?.after.knowledge || '', believes: legacy?.interpretation || '', questions: '' };
    const authored = (['knows', 'believes', 'questions'] as const).filter(k => cognition[k].trim()).map(k => `  ${{ knows: '知道', believes: '相信', questions: '追問' }[k]}：${cognition[k]}`);
    if (o.audienceDesign?.requiredEarlierIds?.length) authored.push(`  必須先揭露：${o.audienceDesign.requiredEarlierIds.map(id => { const at = p.timelines.audience.placements.findIndex(x => x.id === id); return at < 0 ? '來源已移除' : `理解節點 ${at + 1}`; }).join('、')}`);
    for (const e of o.audienceDesign?.expectations ?? []) if (e.text.trim()) authored.push(`  作者設計的期待：${e.text}`);
    return authored.length ? [`第 ${index + 1} 個理解節點 · ${p.units.find(u => u.id === o.eventId)?.title || '未命名事件'}`, ...authored] : [];
  });
  if (understanding.length) out.push('', '觀眾理解（作者設定，依理解順序；不是實測反應）', ...understanding);
  return out.join('\n') + '\n';
}
