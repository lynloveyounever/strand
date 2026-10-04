import { EventLinks, EventSituation, PlotBadges, EventCheckPanel } from './EventFocus';
import { eventRelation } from './eventWorkflow';
import { AtlasIcon, KindIcon } from "./AtlasIcon";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { editor, useEditor } from './store';
import { editUnit, type Project, type StoryLogic } from './model';
import { bases, type Occurrence, type TimeBasis, patchOccurrence } from './temporal';
import { chooseOccurrence } from './AlignedTimelines';
import { createTimelineDemo } from './sample';
import { audienceReadingUpdate, editReadingCharacter, occurrenceMode, readingContext, readingGaps, readingQuestions, readingSentence, type ReadingField } from './storyReading';

function DraftField({ field, label, value, onSave }: { field: ReadingField; label: string; value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label><span>{label}</span><textarea data-reader-field={field} value={draft} maxLength={20000} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onSave(draft); }} placeholder="尚未寫下" /></label>;
}

export default function StoryReader({ mobile, onArrange, onAdvanced, onNew }: { mobile: boolean; onArrange: () => void; onAdvanced: () => void; onNew?: () => void }) {
  const state = useEditor(s => s);
  const routeElement = useRef<HTMLDetailsElement>(null);
  const readerElement = useRef<HTMLElement>(null);
  const editElement = useRef<HTMLElement>(null);
  const editReturn = useRef<{ focus: HTMLElement | null; scroll: number } | null>(null);
  const pendingReturn = useRef(false);
  const expectedProject = useRef(state.project);
  const [preview, setPreview] = useState(false);
  const sample = useMemo(() => createTimelineDemo(), []);
  const [sampleSelection, setSampleSelection] = useState({ basis: 'reality' as TimeBasis, id: 'reality-e1' });
  const project = preview ? sample : state.project;
  const basis = preview ? sampleSelection.basis : state.basis;
  const occurrenceId = preview ? sampleSelection.id : state.occurrenceId;
  const list = project.timelines[basis].placements;
  const active = list.find(o => o.id === occurrenceId) ?? list.find(o => o.eventId === state.selectedId) ?? list[0];
  const [routeNotice, setRouteNotice] = useState('');
  const [lineId, setLineId] = useState('');
  const line = project.narrativeLines?.find(l => l.id === lineId);
  const route = list.filter(o => !line || line.eventIds.includes(o.eventId));
  const visibleActive = active && route.some(o => o.id === active.id) ? active : route[0];
  const index = visibleActive ? list.findIndex(o => o.id === visibleActive.id) : -1;
  const routeIndex = route.findIndex(o => o.id === visibleActive?.id);
  const context = visibleActive ? readingContext(project, visibleActive, basis) : null;
  const [characterId, setCharacterId] = useState('');
  const character = context?.characters.find(c => c.track.id === characterId) ?? context?.characters.find(c => c.transition) ?? context?.characters[0];
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<ReadingField>('title');
  const [focusRequest, setFocusRequest] = useState(0);
  const characterEditing = ['motivation', 'interpretation', 'reaction'].includes(editTarget);
  function commitFocusedField() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && editElement.current?.contains(focused)) focused.blur();
  }
  function openEdit(field: ReadingField, origin?: HTMLElement) {
    if (preview) return;
    commitFocusedField();
    if (!editing) editReturn.current = { focus: origin ?? null, scroll: readerElement.current?.scrollTop ?? 0 };
    expectedProject.current = editor.getState().project;
    setEditTarget(field); setEditing(true); setFocusRequest(n => n + 1);
  }
  function finishEditing(restore = true) {
    commitFocusedField();
    pendingReturn.current = restore;
    setEditing(false);
  }
  useLayoutEffect(() => {
    if (!editing) {
      if (pendingReturn.current && editReturn.current) {
        if (readerElement.current) readerElement.current.scrollTop = editReturn.current.scroll;
        const target = editReturn.current.focus;
        if (target?.isConnected) target.focus({ preventScroll: true });
        else readerElement.current?.querySelector<HTMLButtonElement>('.story-event-heading>button')?.focus({ preventScroll: true });
      }
      pendingReturn.current = false;
      return;
    }
    const field = editElement.current?.querySelector<HTMLTextAreaElement>(`[data-reader-field="${editTarget}"]`);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }, [editing, focusRequest]);
  // An import or undo replaces the working snapshot. Discard the old field draft
  // instead of letting it save into a different project that happens to reuse IDs.
  useLayoutEffect(() => {
    if (editing && state.project !== expectedProject.current) {
      pendingReturn.current = false; setEditing(false);
      setRouteNotice('作品已變更，請重新開啟要編輯的欄位');
    }
    expectedProject.current = state.project;
  }, [state.project]);
  useEffect(() => { setEditing(false); setCharacterId(''); }, [basis, visibleActive?.id, preview]);
  useEffect(() => { if (lineId && !project.narrativeLines?.some(l => l.id === lineId)) setLineId(''); }, [project, lineId]);
  function pick(nextBasis: TimeBasis, item: Occurrence) {
    finishEditing(false);
    if (mobile && routeElement.current) routeElement.current.open = false;
    if (preview) setSampleSelection({ basis: nextBasis, id: item.id });
    else chooseOccurrence(project, nextBasis, item);
  }
  function switchReading(nextBasis: TimeBasis) {
    if (nextBasis === basis) return;
    const mapped = project.timelines[nextBasis].placements.find(o => o.eventId === visibleActive?.eventId);
    const next = mapped ?? project.timelines[nextBasis].placements[0];
    setRouteNotice(mapped ? '' : `「${context?.event.title || '此事件'}」在「${readingQuestions[nextBasis].title}」尚無節點，先從這條順序的第一步閱讀。`);
    setLineId('');
    if (next) pick(nextBasis, next);
  }
  function transact(fn: (p: Project) => void) {
    if (preview) return;
    editor.getState().transact(fn);
    expectedProject.current = editor.getState().project;
  }
  function patch(patch: Parameters<typeof editUnit>[2]) {
    if (context) transact(p => editUnit(p, context.event.id, patch));
  }
  function logicPatch(value: Partial<StoryLogic>) {
    if (context) patch({ storyLogic: { cause: '', outcome: '', ...context.event.storyLogic, ...value } });
  }
  const event = context?.event;
  const causeEvent = project.units.find(u => u.id === event?.storyLogic?.causeEventId);
  const outcomes = event?.storyLogic;
  const audienceDesign = basis === 'audience' ? visibleActive?.audienceDesign : undefined;
  const audienceUpdate = basis === 'audience' && visibleActive ? audienceReadingUpdate(project, visibleActive) : undefined;
  const priorAudience = basis === 'audience' && index > 0 ? list[index - 1].audienceDesign : undefined;
  const respondedExpectations = basis === 'audience' ? list.slice(0, index).flatMap(o => (o.audienceDesign?.expectations ?? []).filter(e => e.responseId === visibleActive?.id)) : [];
  const fact = (text?: string) => text?.trim() || '尚未寫下';
  const gaps = visibleActive ? readingGaps(project, visibleActive, basis, character?.track.id) : [];
  const motivationSource = character?.beforeSourceEventId ? project.units.find(u => u.id === character.beforeSourceEventId) : undefined;
  const editLink = (field: ReadingField, label: string) => !preview && <button className="reader-inline-edit" title={`編輯${label}`} aria-label={`編輯${label}`} onClick={e => openEdit(field, e.currentTarget)}><AtlasIcon name="edit"/></button>;
  function saveCharacter(field: 'motivation' | 'interpretation' | 'reaction', value: string) {
    if (event && character) transact(p => editReadingCharacter(p, event.id, character.track.id, field, value, character.beforeSourceEventId));
  }
  function saveCognition(key: 'knows' | 'believes' | 'questions', value: string) {
    if (!visibleActive) return;
    transact(p => {
      const o = p.timelines.audience.placements.find(o => o.id === visibleActive.id);
      if (!o) return;
      const legacy = audienceReadingUpdate(p, o);
      const design = o.audienceDesign ?? { emotions: {}, cognition: { knows: o.knowledgeNote || legacy?.after.knowledge || '', believes: legacy?.interpretation || '', questions: '' }, supportIds: [], expectations: [] };
      patchOccurrence(p, 'audience', o.id, { audienceDesign: { ...design, cognition: { ...design.cognition, [key]: value } } });
    });
  }
  const worldLogic = event && <div className="story-cause-chain" aria-label="Authored cause action outcome">
    <section data-story-part="cause"><div className="reader-part-heading"><small>為什麼發生</small>{basis === 'reality' && editLink('cause', '為什麼發生')}</div><p className={!outcomes?.cause.trim() ? 'unwritten' : ''}>{outcomes?.cause.trim() || '尚未寫明原因；相鄰事件不一定互為因果'}</p>{causeEvent && <button className="cause-reference" disabled={!project.timelines.reality.placements.some(o => o.eventId === causeEvent.id)} onClick={() => { const o = project.timelines.reality.placements.find(o => o.eventId === causeEvent.id); if (o) { setLineId(''); pick('reality', o); } }}>承接：{causeEvent.title} ↗</button>}{!causeEvent && <small className="reader-optional-reference">未指定承接事件（選填）</small>}</section>
    <section data-story-part="action"><div className="reader-part-heading"><small>發生什麼</small>{basis === 'reality' && editLink('action', '發生什麼')}</div><p>{fact(event.summary)}</p></section>
    <section data-story-part="outcome"><div className="reader-part-heading"><small>造成什麼結果</small>{basis === 'reality' && editLink('outcome', '造成什麼結果')}</div><p className={!outcomes?.outcome.trim() ? 'unwritten' : ''}>{outcomes?.outcome.trim() || '尚未寫明結果'}</p></section>
  </div>;
  return <section ref={readerElement} className="story-reader" data-reading-basis={basis} aria-label="Story reading workspace">
    {preview && <div className="sample-preview-notice" role="status"><span>正在閱讀完整虛構示例 · 你的作品沒有被替換</span><button onClick={() => { setPreview(false); setLineId(''); }}>回到我的作品</button></div>}
    <header className="story-orientation">
      <div className="story-orientation-heading"><div><small>{project.sampleKind ? '虛構故事示例' : '目前作品'}</small><h1>{project.title}</h1></div>{!preview && <div className="reader-project-actions">{onNew && <button onClick={() => { finishEditing(false); onNew(); }}>建立新故事</button>}<button onClick={() => { finishEditing(false); setPreview(true); setLineId(''); }}>閱讀完整示例</button></div>}</div>
      <p className="story-premise">{project.premise || '還沒有故事簡介。可在作品設定中寫下：誰想做什麼，又被什麼阻止？'}</p>
      <details className="story-cast"><summary>人物與開場處境 · {project.tracks.filter(t => t.kind === 'character').length} 人</summary><div>{project.tracks.filter(t => t.kind === 'character').map(t => <section key={t.id} style={{ '--character-color': t.color } as CSSProperties}><b>{t.name}</b><p><span>想要</span>{fact(t.initial.goal)}</p><p><span>阻礙</span>{fact(t.initial.obstacle)}</p><small>{t.description}</small></section>)}{!project.tracks.some(t => t.kind === 'character') && <p>尚未建立人物。可在「單線編輯 → Track」加入</p>}</div></details>
    </header>
    <nav className="reading-tabs" aria-label="Choose story reading order">{bases.map(b => <button key={b} aria-pressed={basis === b} onClick={() => switchReading(b)}><b><AtlasIcon name={b}/>{readingQuestions[b].title}</b><span>{({reality:'行動與因果', narrative:'播放與揭露', audience:'認知與期待'})[b]}</span></button>)}</nav>
    {routeNotice && <p className="reader-route-notice" role="status">{routeNotice}</p>}
    <div className="story-reading-body">
      <details ref={routeElement} className="story-route" open={!mobile}><summary>選擇事件 · {routeIndex + 1} / {route.length}</summary>
        <div className="story-route-tools"><strong>{line ? line.title : '完整故事'}</strong>{!!project.narrativeLines?.length && <label><span>聚焦故事線</span><select aria-label="聚焦故事線" value={lineId} onChange={e => { const id = e.target.value; setLineId(id); const filter = project.narrativeLines?.find(l => l.id === id); const item = list.find(o => !filter || filter.eventIds.includes(o.eventId)); if (item) pick(basis, item); }}><option value="">全部事件</option>{project.narrativeLines.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>}<p>{line ? '只列這條線包含的事件；編號保留完整故事中的位置' : '依序往下讀；順序不等於因果'}</p></div>
        <ol>{route.map((item, n) => {
          const event = project.units.find(u => u.id === item.eventId)!;
          const scene = project.units.find(u => u.id === item.containerId);
          const previousScene = route[n - 1]?.containerId;
          const position = list.findIndex(o => o.id === item.id);
          return <li key={item.id} data-event-relation={eventRelation(project, visibleActive?.eventId ?? '', item.eventId)}>{previousScene !== item.containerId && <div className="reader-scene"><b><KindIcon kind="scene"/>{basis === "narrative" ? "呈現段落 · " : basis === "audience" ? "理解段落 · " : ""}{scene?.title}</b>{basis === "reality" && scene?.summary && <span>{scene.summary}</span>}</div>}<button data-reading-occurrence={item.id} aria-pressed={visibleActive?.id === item.id} onClick={() => pick(basis, item)}><span className="reader-event-number">{String(position + 1).padStart(2, '0')}</span><span><b>{event.title}</b><span>{readingSentence(event, item, basis, project)}</span><PlotBadges project={project} eventId={event.id}/>{eventRelation(project, visibleActive?.eventId ?? '', event.id) === 'cause' && <em>目前事件的原因</em>}{eventRelation(project, visibleActive?.eventId ?? '', event.id) === 'consequence' && <em>目前事件的後果</em>}{basis !== 'reality' && <small>{occurrenceMode[item.mode]}</small>}</span></button></li>;
        })}</ol>{!route.length && <p className="story-empty">這條故事線在此順序尚無事件。請選「全部事件」或編輯故事線</p>}
      </details>
      <article className="story-event-detail" aria-label="Readable selected event">
        {event && context && visibleActive ? <>
          <div className="story-step-navigation"><button aria-label="閱讀上一個事件" disabled={routeIndex <= 0} onClick={() => pick(basis, route[routeIndex - 1])}>← 上一個</button><span>{readingQuestions[basis].title} · {index + 1} / {list.length}</span><button aria-label="閱讀下一個事件" disabled={routeIndex >= route.length - 1} onClick={() => pick(basis, route[routeIndex + 1])}>下一個 →</button></div>
          <div className="story-event-heading"><span className="story-chapter-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><p>{basis === "narrative" ? "呈現段落 · " : basis === "audience" ? "理解段落 · " : ""}{context.act?.title} · {context.scene?.title}</p><h2>{event.title}</h2></div>{!preview && <button aria-pressed={editing} onClick={e => editing ? finishEditing() : openEdit(basis === 'reality' ? 'title' : basis === 'narrative' ? 'note' : 'knows', e.currentTarget)}>{editing ? '完成編輯' : basis === 'reality' ? '編輯這個事件' : basis === 'narrative' ? '編輯這次呈現' : '編輯這步理解'}</button>}{preview && <button onClick={() => { setPreview(false); setLineId(''); }}>回到我的作品編輯</button>}</div>
          <EventLinks project={project} eventId={event.id} pick={id => { const o = project.timelines[basis].placements.find(o => o.eventId === id); const world = project.timelines.reality.placements.find(o => o.eventId === id); setLineId(''); if (o) pick(basis, o); else if (world) pick('reality', world); }}/>
          {!preview && gaps.length > 0 && <details className="reader-gaps"><summary>這一步尚未寫下 · {gaps.length} 個欄位</summary><p>空白也可以是刻意保留；這裡只列出尚無文字的欄位，不是必填清單</p><div>{gaps.map(gap => <button key={gap.field} onClick={e => openEdit(gap.field, e.currentTarget)}><small>{gap.category}</small>{gap.label} ↗</button>)}</div></details>}
          {basis === 'reality' ? worldLogic : basis === 'narrative' ? <section className="story-presentation"><small>第 {index + 1} 次呈現 · {occurrenceMode[visibleActive.mode]}</small><div className="reader-part-heading"><h3>這時讓觀眾看到什麼？</h3>{editLink('note', '這次呈現什麼')}</div><p>{readingSentence(event, visibleActive, basis, project)}</p>{!visibleActive.note.trim() && <small>這次呈現尚無獨立文字；目前沿用事件敘述</small>}<div><div className="reader-part-heading"><span>資訊如何保留／揭露</span>{editLink('knowledgeNote', '這次揭露／保留什麼')}</div><p>{visibleActive.knowledgeNote || '尚未另外寫下揭露說明'}</p></div><div><span>希望產生的效果 · 作者用意</span><p>{fact(event.audienceEffect)}</p></div></section> : <section className="story-understanding"><small>作者設定{audienceDesign?.example ? ' · 虛構示例' : ''}，不代表實測觀眾反應</small><h3>觀眾在這一步如何理解？</h3><div className="reader-cognition">{(['knows', 'believes', 'questions'] as const).map((key, i) => <section key={key}><div className="reader-part-heading"><small>{['知道的事', '相信的解釋', '還在追問'][i]}</small>{editLink(key, ['知道的事', '相信的解釋', '還在追問'][i])}</div><p>{fact(audienceDesign ? audienceDesign.cognition[key] : (key === 'knows' ? visibleActive.knowledgeNote || audienceUpdate?.after.knowledge : key === 'believes' ? audienceUpdate?.interpretation : ''))}</p>{priorAudience?.cognition[key] && <div className="reader-before"><span>上一個理解節點</span>{priorAudience.cognition[key]}</div>}</section>)}</div><div className="reader-expectations"><b>此處的預期與回應</b>{!(audienceDesign?.expectations?.length || respondedExpectations.length) ? <p>尚未設定預期或回應</p> : [...(audienceDesign?.expectations ?? []), ...respondedExpectations].map((e, n) => <p key={e.id + n}><span>{respondedExpectations.includes(e) ? '在此回應' : ({ prediction: '預測', hope: '希望', fear: '擔心' }[e.kind])} · </span>{e.text}<small>{respondedExpectations.includes(e) ? '此處' : e.responseId ? `預計第 ${list.findIndex(o => o.id === e.responseId) + 1} 個理解節點` : ''}{({ open: '尚未回應', realized: '實現', delayed: '延後', subverted: '反轉' }[e.response])}</small></p>)}</div></section>}
          {basis !== 'reality' && <details className="world-truth"><summary>故事世界中實際發生什麼？（作者檢視）</summary>{worldLogic}</details>}
          {basis === 'reality' && context.characters.length > 0 && <section className="reader-character"><div className="reader-section-heading"><h3>人物為何這樣做？</h3><div role="group" aria-label="Read character perspective">{context.characters.map(c => <button key={c.track.id} aria-pressed={character?.track.id === c.track.id} onClick={() => { finishEditing(false); setCharacterId(c.track.id); }}>{c.track.name}</button>)}</div></div>{character && <><div className="character-decision"><section><small>原先想要</small><p>{fact(character.before?.goal)}</p><div className="reader-part-heading"><small>推動他的需要</small>{character.before && !character.beforeUnresolved && editLink('motivation', `${character.track.name}的動機`)}</div><p>{fact(character.before?.motivation)}</p><small className="reader-source-label">{character.beforeUnresolved ? character.beforeSourceNote : motivationSource ? `沿用〈${motivationSource.title}〉之後的設定` : '沿用開場設定'}</small></section><section><div className="reader-part-heading"><small>如何理解這件事</small>{(character.transition || !character.beforeUnresolved) && editLink('interpretation', `${character.track.name}的解讀`)}</div><p>{character.transition?.interpretation || '此事件尚未寫下這個人物的解讀'}</p><div className="reader-part-heading"><small>採取的反應</small>{(character.transition || !character.beforeUnresolved) && editLink('reaction', `${character.track.name}的反應`)}</div><p>{character.transition?.reaction || '此事件尚未寫下這個人物的反應'}</p></section></div><div className="character-shift"><span>人物狀態</span><b><span>{fact(character.before?.state)}</span><i aria-hidden="true">→</i><span>{fact(character.after?.state)}</span></b><p><span>此刻知道</span>{fact(character.after?.knowledge)}</p><small>{context.worldIndex < 0 ? '此事件未安排在故事世界順序，無法取得前後狀態' : character.transition ? '此事件已寫下的改變' : '沿用最近已寫下的狀態；不代表此事件沒有變化'}</small></div></>}</section>}
          <details className="reader-event-context"><summary>展開世界、人物與觀眾的同一事件對照</summary><EventSituation project={project} event={event} audienceId={basis === 'audience' ? visibleActive.id : undefined}/></details>
          <EventCheckPanel project={project} eventId={event.id} readonly={preview} pick={id => { const o = project.timelines.reality.placements.find(o => o.eventId === id); if (o) { setLineId(''); pick('reality', o); } }}/>
          {basis === 'reality' && <section className="reader-audience-links"><h3>觀眾何時理解這件事？</h3>{context.audienceItems.length ? <div>{context.audienceItems.map(o => <button key={o.id} onClick={() => { setLineId(''); pick('audience', o); }}>第 {project.timelines.audience.placements.findIndex(a => a.id === o.id) + 1} 個理解節點 · {occurrenceMode[o.mode]} ↗</button>)}</div> : <p>此事件尚未安排觀眾理解節點</p>}</section>}
          {editing && !preview && <section ref={editElement} className="reader-edit" aria-label="Edit story logic" onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEditing(); } }} key={`${basis}:${visibleActive.id}:${characterEditing ? character?.track.id : 'event'}`}>
            <h3>{characterEditing ? `寫下${character?.track.name}的選擇` : basis === 'reality' ? '把這個事件寫清楚' : basis === 'narrative' ? '編輯這次呈現的內容' : '編輯這一步的觀眾理解'}</h3>
            <p>離開欄位即儲存；完成後回到原來的閱讀位置</p>
            {characterEditing && character ? <>
              <div className="reader-source-note">動機來源：{character.beforeUnresolved ? character.beforeSourceNote : motivationSource ? `〈${motivationSource.title}〉之後的設定` : '開場設定'}。修改會影響沿用這份設定的後續事件</div>
              {!character.beforeUnresolved && <DraftField field="motivation" label="推動他的需要" value={character.before?.motivation || ''} onSave={value => saveCharacter('motivation', value)} />}
              {!character.transition && <p>{character.beforeUnresolved ? '前項狀態未定；請先釐清時序，或到事件詳情明確填寫完整更新。' : '此人物尚未連結到這個事件。寫下解讀或反應後才會建立連結，其餘狀態沿用先前設定'}</p>}
              <DraftField field="interpretation" label="如何理解這件事" value={character.transition?.interpretation || ''} onSave={value => saveCharacter('interpretation', value)} />
              <DraftField field="reaction" label="採取的反應" value={character.transition?.reaction || ''} onSave={value => saveCharacter('reaction', value)} />
            </> : basis === 'narrative' ? <>
              <DraftField field="note" label="這次呈現什麼" value={visibleActive.note} onSave={note => transact(p => patchOccurrence(p, basis, visibleActive.id, { note }))} />
              <DraftField field="knowledgeNote" label="這次揭露／保留什麼" value={visibleActive.knowledgeNote} onSave={knowledgeNote => transact(p => patchOccurrence(p, basis, visibleActive.id, { knowledgeNote }))} />
            </> : basis === 'audience' ? <>
              <DraftField field="knows" label="這一步觀眾知道什麼" value={audienceDesign ? audienceDesign.cognition.knows : visibleActive.knowledgeNote || audienceUpdate?.after.knowledge || ''} onSave={value => saveCognition('knows', value)} />
              <DraftField field="believes" label="這一步觀眾相信什麼" value={audienceDesign ? audienceDesign.cognition.believes : audienceUpdate?.interpretation || ''} onSave={value => saveCognition('believes', value)} />
              <DraftField field="questions" label="這一步觀眾還在追問什麼" value={audienceDesign?.cognition.questions || ''} onSave={value => saveCognition('questions', value)} />
            </> : <>
              <p>原因與結果由你寫下，不會從前後順序自動推測</p>
              <DraftField field="title" label="事件名稱" value={event.title} onSave={title => patch({ title })} />
              <DraftField field="cause" label="為什麼發生" value={outcomes?.cause || ''} onSave={cause => logicPatch({ cause })} />
              <label><span>原因承接哪個事件（選填）</span><select aria-label="原因承接哪個事件" value={outcomes?.causeEventId || ''} onChange={e => logicPatch({ causeEventId: e.target.value || undefined })}><option value="">未指定；可能是背景處境</option>{project.units.filter(u => u.kind === 'beat' && u.id !== event.id).map(u => <option key={u.id} value={u.id}>{u.title}</option>)}</select></label>
              <DraftField field="action" label="發生什麼" value={event.summary} onSave={summary => patch({ summary })} />
              <DraftField field="outcome" label="造成什麼結果" value={outcomes?.outcome || ''} onSave={outcome => logicPatch({ outcome })} />
            </>}
            <div className="reader-edit-actions"><button onClick={() => finishEditing()}>完成編輯</button></div>
            <details className="reader-extra-fields"><summary>其他欄位</summary><button onClick={() => { commitFocusedField(); if (character) editor.setState({ trackId: character.track.id }); editor.setState({ panel: 'edit', inspectorOpen: true, outlineOpen: false }); }}>人物狀態與其他欄位</button>{basis === 'audience' && <button onClick={() => { finishEditing(false); onAdvanced(); }}>編輯情緒與預期</button>}</details>
          </section>}
          {!preview && <details className="reader-more"><summary>編排與深入設計</summary><div><button onClick={onArrange}>對照三種順序</button><button disabled={basis !== "audience" && context.audienceItems.length !== 1} onClick={() => { if (basis !== "audience" && context.audienceItems[0]) pick("audience", context.audienceItems[0]); onAdvanced(); }}>編輯觀眾情緒與預期</button>{basis !== "audience" && context.audienceItems.length === 0 && <span>此事件尚無觀眾理解節點</span>}{basis !== "audience" && context.audienceItems.length > 1 && context.audienceItems.map(o => <button key={o.id} onClick={() => { pick("audience", o); onAdvanced(); }}>編輯第 {project.timelines.audience.placements.findIndex(x => x.id === o.id) + 1} 個理解節點</button>)}<button onClick={() => editor.setState({ panel: 'stages', inspectorOpen: true, outlineOpen: false })}>編劇／演員／導演版本</button></div><p>順序對照用來找同一事件的位置；人物、觀眾與版本工具保留在這裡</p></details>}
        </> : <div className="story-empty"><h2>這條線還沒有事件</h2><p>先選擇另一種閱讀順序，或在編排工具加入事件</p></div>}
      </article>
    </div>
  </section>;
}
