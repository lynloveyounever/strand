import { clone, setTransition, updateBlueprint, type Project, type Unit } from './model';
import { stateAtBasis, type Occurrence, type TimeBasis } from './temporal';

export const readingQuestions: Record<TimeBasis, { title: string; description: string }> = {
  reality: { title: '故事怎麼發生', description: '依故事世界的先後，讀懂人物行動與後果' },
  narrative: { title: '觀眾怎麼看到', description: '依播放順序，查看倒敘、重複與刻意保留的資訊' },
  audience: { title: '觀眾怎麼理解', description: '依作者設定的理解節點，查看知道、誤信與期待' },
};
export const occurrenceMode = { present: '順敘', flashback: '倒敘', flashforward: '預敘', repeat: '再次呈現', disclosure: '理解節點' };
export function audienceReadingUpdate(project: Project, item: Occurrence) {
  return item.updates.find(u => project.tracks.some(t => t.id === u.trackId && t.kind === 'audience'));
}
export function readingSentence(event: Unit, item: Occurrence, basis: TimeBasis, project?: Project) {
  if (basis === 'audience') return (item.audienceDesign ? item.audienceDesign.cognition.knows : item.knowledgeNote || (project ? audienceReadingUpdate(project, item)?.after.knowledge : '')) || '尚未寫下觀眾在此處知道什麼';
  if (basis === 'narrative') return item.note || event.summary || '尚未寫下這次呈現的內容';
  return event.summary || '尚未寫下發生什麼';
}
export function readingContext(project: Project, item: Occurrence, basis: TimeBasis) {
  const event = project.units.find(u => u.id === item.eventId)!;
  const worldIndex = project.timelines.reality.placements.findIndex(o => o.eventId === event.id);
  const scene = project.units.find(u => u.id === item.containerId);
  const sequence = project.units.find(u => u.id === scene?.parentId);
  const act = project.units.find(u => u.id === sequence?.parentId);
  const characters = project.tracks.filter(t => t.kind === 'character').map(track => {
    const transition = project.transitions.find(t => t.eventId === event.id && t.trackId === track.id);
    const beforeState = worldIndex >= 0 ? stateAtBasis(project, track.id, worldIndex + .499, 'reality') : undefined;
    return { track, transition, beforeSourceEventId: beforeState?.eventId, beforeUnresolved: beforeState?.unresolved, beforeSourceNote: beforeState?.source, before: beforeState?.snapshot,
      after: worldIndex >= 0 ? stateAtBasis(project, track.id, worldIndex + .5, 'reality').snapshot : undefined };
  });
  const audienceItems = project.timelines.audience.placements.filter(o => o.eventId === event.id);
  // Never silently use another occurrence's design when reading an exact audience occurrence.
  const audience = basis === 'audience' ? item : undefined;
  return { event, worldIndex, scene, sequence, act, characters, audienceItems, audience };
}


export type ReadingField = 'title' | 'cause' | 'action' | 'outcome' | 'motivation' | 'interpretation' | 'reaction' | 'note' | 'knowledgeNote' | 'knows' | 'believes' | 'questions';
export type ReadingGap = { field: ReadingField; category: string; label: string };
// This is an inventory of empty text, not a judgement of story completeness.
// Optional references, unmapped timelines and unlinked characters are not errors.
export function readingGaps(project: Project, item: Occurrence, basis: TimeBasis, trackId?: string): ReadingGap[] {
  const context = readingContext(project, item, basis);
  const gaps: ReadingGap[] = [];
  const add = (field: ReadingField, category: string, label: string, value?: string) => {
    if (!value?.trim()) gaps.push({ field, category, label });
  };
  if (basis === 'reality') {
    add('cause', '事件', '為什麼發生', context.event.storyLogic?.cause);
    add('action', '事件', '發生什麼', context.event.summary);
    add('outcome', '事件', '造成什麼結果', context.event.storyLogic?.outcome);
    const character = context.characters.find(c => c.track.id === trackId);
    if (character?.transition) {
      if (!character.beforeUnresolved) add('motivation', character.track.name, '推動他的需要', character.before?.motivation);
      add('interpretation', character.track.name, '如何理解這件事', character.transition.interpretation);
      add('reaction', character.track.name, '採取的反應', character.transition.reaction);
    }
  } else if (basis === 'narrative') {
    add('note', '這次呈現', '這次呈現什麼', item.note);
    add('knowledgeNote', '這次呈現', '這次揭露／保留什麼', item.knowledgeNote);
  } else {
    const update = audienceReadingUpdate(project, item);
    add('knows', '這步理解', '知道的事', item.audienceDesign ? item.audienceDesign.cognition.knows : item.knowledgeNote || update?.after.knowledge);
    add('believes', '這步理解', '相信的解釋', item.audienceDesign ? item.audienceDesign.cognition.believes : update?.interpretation);
    add('questions', '這步理解', '還在追問', item.audienceDesign?.cognition.questions);
  }
  return gaps;
}

export function editReadingCharacter(project: Project, eventId: string, trackId: string, field: 'motivation' | 'interpretation' | 'reaction', value: string, expectedSource?: string | null) {
  const item = project.timelines.reality.placements.find(o => o.eventId === eventId);
  if (!item) throw new Error('此事件尚未安排在故事世界順序，無法編輯人物前後狀態');
  const character = readingContext(project, item, 'reality').characters.find(c => c.track.id === trackId);
  if (!character?.before) throw new Error('找不到這個人物的故事狀態');
  if (field === 'motivation') {
    if (character.beforeUnresolved) throw new Error('前項時序或來源未確定，不能改寫開場或任意前項動機；請先釐清世界時序');
    if (expectedSource !== undefined && expectedSource !== character.beforeSourceEventId) throw new Error('人物動機的來源已變更，請重新開啟編輯');
    if (character.before.motivation === value) return;
    if (character.beforeSourceEventId) {
      const source = project.transitions.find(t => t.eventId === character.beforeSourceEventId && t.trackId === trackId);
      if (!source) throw new Error('人物動機的來源已變更，請重新開啟編輯');
      source.after.motivation = value;
    } else character.track.initial.motivation = value;
    // An inherited state can affect downstream reading and realization context.
    // Reopen current blueprints conservatively; retain every approved snapshot.
    updateBlueprint(project, project.units.find(u => u.kind === 'story')!.id);
  } else {
    if (!character.transition && character.beforeUnresolved) throw new Error('狀態前項未定；請在事件詳情明確填寫完整的人物更新');
    if ((!character.transition && !value.trim()) || character.transition?.[field] === value) return;
    setTransition(project, { ...(character.transition ? clone(character.transition) : {
      eventId, trackId, interpretation: '', reaction: '', after: clone(character.before),
    }), [field]: value });
  }
}
