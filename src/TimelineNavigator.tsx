import { StoryTrackControls, StoryTrackRows } from './StoryTracks';
import { RealityTimingSummary } from './RealityTiming';
import PlotLineRows from './PlotLineRows';
import LayeredView from './LayeredView';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import Hologram from './Hologram';
import { AtlasIcon, basisNames } from './AtlasIcon';
import AuthoredEmotionChart, { emotionLabels } from './AuthoredEmotionChart';
import { emotionTypes } from './audience';
import { editor, useEditor } from './store';
import { descendants, type Project } from './model';
import { bases, type Occurrence, type TimeBasis } from './temporal';
import { audienceReadingUpdate, occurrenceMode, readingContext, readingSentence } from './storyReading';
import { authoredState, cursorOccurrence, initialPlaybackCursor, nearestOccurrence, referenceFrame, stepCursor, type TimelineCursor } from './playback';

const axisTitles: Record<TimeBasis, string> = { reality: '故事發生', narrative: '觀眾看到', audience: '觀眾理解' };
const display = (value?: string) => ({ 'Unstated': '尚未寫下', 'Not disclosed': '尚未設定理解', 'Unmapped in Reality': '缺少世界順序對應', 'No audience clock': '未對應觀眾時刻' }[value ?? ''] || value?.trim() || '尚未寫下');
function StateSummary({ state }: { state: NonNullable<ReturnType<typeof authoredState>> }) {
  return <div className="navigator-state" data-state-track={state.track.id}>
    <b>{state.track.name}</b><span>{state.unknown ? '缺少世界順序對應，狀態未知' : display(state.snapshot.state)}</span>
    {!state.unknown && <><small>知道：{display(state.snapshot.knowledge)}</small><small className="navigator-provenance">{state.unresolved ? state.source : state.sourceEvent ? `沿用${basisNames[state.sourceBasis]}第 ${state.sourceIndex + 1} 步〈${state.sourceEvent.title}〉之後的設定` : state.sourceBasis === 'audience' && state.track.kind === 'character' ? '理解線尚無這個人物的已寫更新' : '沿用作者的開場設定'}{state.sourceBasis === 'audience' && state.track.kind === 'character' ? ' · 觀眾對人物的理解' : ''}</small></>}
  </div>;
}
function AxisDetail({ p, cursor, onSelect, onBack }: { p: Project; cursor: TimelineCursor; onSelect: (c: TimelineCursor) => void; onBack: () => void }) {
  const current = cursorOccurrence(p, cursor), heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  if (!current) return <section className="axis-detail"><button onClick={onBack}>← 回到三線總覽</button><p>原本的節點已移除，請回總覽重新選擇</p></section>;
  const { item, index } = current, list = p.timelines[cursor.basis].placements;
  const context = readingContext(p, item, cursor.basis), audience = audienceReadingUpdate(p, item);
  const fields = item.audienceDesign?.cognition;
  const move = (n: number) => { const next = stepCursor(p, cursor, n); if (next) onSelect(next); };
  const states = p.tracks.filter(t => cursor.basis === 'audience' || t.kind === 'character').map(t => authoredState(p, t, cursor)).filter((s): s is NonNullable<typeof s> => !!s);
  return <section className="axis-detail" data-focus-basis={cursor.basis} aria-label="單線閱讀細節" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onBack(); } }}>
    <header className="navigator-heading"><button onClick={onBack} title="返回原本的三線總覽、播放位置與選取">← 回到三線總覽</button><h2 ref={heading} tabIndex={-1}><AtlasIcon name={cursor.basis}/>{axisTitles[cursor.basis]}</h2><small>{list.length} 個節點 · {basisNames[cursor.basis]}</small><button aria-label="編輯目前單線節點" title="在右側編輯所選事件或這次呈現，保留目前閱讀位置" onClick={() => editor.setState({ panel: cursor.basis === 'reality' ? 'edit' : 'compare', inspectorOpen: true, outlineOpen: false })}><AtlasIcon name="edit"/>編輯此節點</button></header>
    <div className="focus-event-track" aria-label="這條線的事件軌"><ol>{list.map((o, i) => <li key={o.id}><button data-focus-occurrence={o.id} aria-pressed={o.id === item.id} onClick={() => onSelect({ basis: cursor.basis, occurrenceId: o.id })}><span>{String(i + 1).padStart(2, '0')}</span><b>{p.units.find(u => u.id === o.eventId)?.title}</b>{o.mode === 'repeat' && <small>再次呈現</small>}</button></li>)}</ol></div>
    <StoryTrackControls/><StoryTrackRows p={p} basis={cursor.basis} occurrenceId={item.id} onSelect={onSelect}/>{cursor.basis === 'reality' && <RealityTimingSummary p={p} eventId={item.eventId}/>}
    {cursor.basis === 'audience' ? <AuthoredEmotionChart list={list} selectedId={item.id}/> : !p.storyTracks?.some(t => t.basis === cursor.basis && t.representation === 'number') ? <small className="focus-emotion-note">這條線尚無情緒數值模型；人物狀態維持文字，沒有換算成分數。</small> : null}
    <article className="focus-event-reading">
      <nav className="focus-step-navigation" aria-label="單線事件導覽"><button disabled={index === 0} onClick={() => move(-1)}>← 上一步</button><small>{cursor.basis === 'reality' && p.realityTiming ? '閱讀位置' : '第'} {index + 1} / {list.length} 步 · {occurrenceMode[item.mode]}</small><button disabled={index === list.length - 1} onClick={() => move(1)}>下一步 →</button></nav>
      <div className="focus-event-title"><small>{context.scene?.title}</small><h3>{context.event.title}</h3></div>
      {cursor.basis === 'reality' ? <div className="focus-reading-chain">{[['為什麼發生', context.event.storyLogic?.cause], ['發生什麼', context.event.summary], ['造成什麼結果', context.event.storyLogic?.outcome]].map(([label, text]) => <section key={label}><small>{label}</small><p>{display(text)}</p></section>)}</div> : cursor.basis === 'narrative' ? <div className="focus-reading-copy"><p>{readingSentence(context.event, item, cursor.basis, p)}</p>{!item.note.trim() && <small>這次呈現尚無獨立文字；以上沿用共用事件敘述</small>}<section><small>揭露／保留說明</small><p>{display(item.knowledgeNote)}</p></section></div> : <div className="focus-reading-copy"><small>作者設定，不代表實測觀眾反應</small><div className="focus-cognition">{(['knows', 'believes', 'questions'] as const).map((k, i) => <section key={k}><small>{['知道的事', '相信的解釋', '還在追問'][i]}</small><p>{display(fields ? fields[k] : k === 'knows' ? item.knowledgeNote || audience?.after.knowledge : k === 'believes' ? audience?.interpretation : '')}</p></section>)}</div><div className="focus-current-emotions">{emotionTypes.map(k => <span key={k}>{emotionLabels[k]} <b>{item.audienceDesign?.emotions[k] ?? '未填'}</b></span>)}</div></div>}
      {!!states.length && <details className="focus-state-details"><summary>{cursor.basis === 'audience' ? '視角狀態快照 · 沿用已寫更新' : '對應事件中的人物狀態'}</summary><div>{states.map(s => <StateSummary key={s.track.id} state={s}/>)}</div><small>狀態與知道的事是作者文字設定，不會換算成情緒分數</small></details>}
      {cursor.basis !== 'audience' && <section className="focus-correspondence"><h4>同一事件的觀眾理解</h4><p>事件相同，不代表發生在同一播放時刻。請選擇要閱讀的節點。</p>{context.audienceItems.length ? context.audienceItems.map(o => <button key={o.id} onClick={() => onSelect({ basis: 'audience', occurrenceId: o.id })}>理解第 {p.timelines.audience.placements.indexOf(o) + 1} 步 · {o.audienceDesign?.cognition.believes || '查看已寫設定'} ↗</button>) : <small>尚無對應的理解節點</small>}</section>}
    </article>
  </section>;
}

export default function TimelineNavigator({ onFlat, spatialTools }: { onFlat: () => void; spatialTools?: ReactNode }) {
  const p = useEditor(s => s.project), focusRequest = useEditor(s => s.focusRequest);
  const [cursor, setCursor] = useState<TimelineCursor | null>(() => initialPlaybackCursor(p, editor.getState()));
  const [preview, setPreview] = useState<TimelineCursor | null>(null);
  const [focus, setFocus] = useState<TimelineCursor | null>(null);
  const [playing, setPlaying] = useState(false), [cadence, setCadence] = useState(1500);
  const [spatial, setSpatial] = useState(false), [layered, setLayered] = useState(false), [notice, setNotice] = useState('');
  const region = useRef<HTMLElement>(null), lastProject = useRef(p), returnPoint = useRef<{ selectedId: string; basis: TimeBasis; occurrenceId: string; playhead: number; trackId: string; lineId: string; scroll: number; sourceIndex: number; element: HTMLElement | null } | null>(null);
  const restore = useRef(false), restoringFocus = useRef(false);
  const active = cursorOccurrence(p, cursor), shown = referenceFrame(p, preview ?? cursor);
  useEffect(() => {
    if (lastProject.current === p) return;
    lastProject.current = p; setPlaying(false); setPreview(null);
    if (cursor && !cursorOccurrence(p, cursor)) { setCursor(null); setNotice('原本的播放節點已移除，請選擇新的呈現步序'); }
    if (focus) {
      const located = cursorOccurrence(p, focus);
      if (!located) { setFocus(null); setNotice('正在閱讀的節點已移除，請重新選擇'); }
      else if (editor.getState().occurrenceId === focus.occurrenceId && editor.getState().basis === focus.basis) editor.setState({ basis: focus.basis, occurrenceId: focus.occurrenceId, selectedId: located.item.eventId, playhead: located.index + .5 });
    }
  }, [p, cursor, focus]);
  useEffect(() => {
    if (!playing || !cursor || !active || preview || focus) return;
    if (active.index >= p.timelines.narrative.placements.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setCursor(previous => stepCursor(p, previous, 1)), cadence);
    return () => window.clearTimeout(timer);
  }, [p, cursor, playing, cadence, preview, focus]);
  useEffect(() => {
    if (!cursor || preview || focus) return;
    const node = Array.from(region.current?.querySelectorAll<HTMLElement>('[data-overview-occurrence]') ?? []).find(el => el.dataset.overviewOccurrence === cursor.occurrenceId);
    if (node?.parentElement && node.parentElement.scrollWidth > node.parentElement.clientWidth) node.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [cursor, preview, focus]);
  useEffect(() => { const pause = () => { if (document.hidden) setPlaying(false); }; document.addEventListener('visibilitychange', pause); return () => document.removeEventListener('visibilitychange', pause); }, []);
  useLayoutEffect(() => {
    if (focus || !restore.current) return;
    restore.current = false;
    if (region.current && returnPoint.current) region.current.scrollTop = returnPoint.current.scroll;
    restoringFocus.current = true;
    returnPoint.current?.element?.focus({ preventScroll: true });
    restoringFocus.current = false;
  }, [focus]);
  useEffect(() => {
    if (!focusRequest) return;
    if (cursorOccurrence(p, focusRequest)) select(focusRequest);
    editor.setState({ focusRequest: null });
  }, [focusRequest, p]);
  function select(next: TimelineCursor) {
    const occurrence = cursorOccurrence(p, next);
    if (!occurrence) return;
    setFocus(next); setPreview(null); setPlaying(false);
    editor.setState({ basis: next.basis, occurrenceId: next.occurrenceId, selectedId: occurrence.item.eventId, playhead: occurrence.index + .5 });
  }
  function enter(next: TimelineCursor, element?: HTMLElement) {
    const state = editor.getState();
    returnPoint.current = { selectedId: state.selectedId, basis: state.basis, occurrenceId: state.occurrenceId, playhead: state.playhead, trackId: state.trackId, lineId: state.lineId, scroll: region.current?.scrollTop ?? 0, sourceIndex: cursorOccurrence(p, state)?.index ?? 0, element: element ?? null };
    select(next);
  }
  function back() {
    const previous = returnPoint.current;
    const origin = previous ? cursorOccurrence(p, previous) : null;
    if (previous && origin && (origin.item.eventId === previous.selectedId || descendants(p, previous.selectedId).some(u => u.id === origin.item.eventId))) {
      const { scroll, sourceIndex, element, ...selection } = previous;
      editor.setState({ ...selection, playhead: Math.max(0, Math.min(p.timelines[previous.basis].placements.length, origin.index + previous.playhead - sourceIndex)), trackId: previous.trackId === 'author' || p.tracks.some(t => t.id === previous.trackId) ? previous.trackId : 'author', lineId: p.narrativeLines?.some(l => l.id === previous.lineId) ? previous.lineId : '' });
    } else if (previous) setNotice('原本的選取位置已變更，沒有恢復已移除的節點');
    setFocus(null); setPreview(null); restore.current = true;
  }
  function scrub(index: number) { const item = p.timelines.narrative.placements[index]; if (item) { setPlaying(false); setPreview(null); setNotice(''); setCursor({ basis: 'narrative', occurrenceId: item.id }); } }
  function hoverRail(e: PointerEvent<HTMLElement>, basis: TimeBasis) {
    if (e.pointerType === 'touch') return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const item = nearestOccurrence(p.timelines[basis].placements, (e.clientX - box.left + e.currentTarget.scrollLeft) / (e.currentTarget.scrollWidth || box.width));
    if (item) setPreview({ basis, occurrenceId: item.id });
  }
  return <section className="timeline-navigator" ref={region} aria-label="三線總覽與播放" data-previewing={!!preview}>
    <div hidden={!!focus} className="navigator-overview">
      <header className="navigator-heading"><div><h2><AtlasIcon name="layers"/>三線總覽</h2><small>移動游標暫看；點選節點進入那條線</small></div><button aria-label="顯示2.5D分層對照" aria-expanded={layered} onClick={() => setLayered(!layered)}><AtlasIcon name="layers"/>2.5D 分層 <AtlasIcon name="chevron" className="disclosure-chevron"/></button><button aria-label="顯示空間投影" aria-expanded={spatial} onClick={() => setSpatial(!spatial)}><AtlasIcon name="cube"/>空間投影 <AtlasIcon name="chevron" className="disclosure-chevron"/></button></header>
      <section className="reference-playback" aria-label="播放進度">
        <div className="reference-controls"><button aria-label={playing ? '暫停播放' : '播放呈現步序'} disabled={!p.timelines.narrative.placements.length} onClick={() => { setPreview(null); if (!active || active.index === p.timelines.narrative.placements.length - 1) scrub(0); setPlaying(!playing); }}>{playing ? 'Ⅱ 暫停' : '▶ 播放'}</button><button aria-label="前一呈現步" disabled={!active || active.index === 0} onClick={() => scrub(active!.index - 1)}>←</button><button aria-label="後一呈現步" disabled={!active || active.index >= p.timelines.narrative.placements.length - 1} onClick={() => scrub(active!.index + 1)}>→</button><label className="reference-scrub"><span>播放進度 · 呈現第 {active ? active.index + 1 : '—'} / {p.timelines.narrative.placements.length} 步</span><input aria-label="呈現步序" type="range" min="0" max={Math.max(0, p.timelines.narrative.placements.length - 1)} value={active?.index ?? 0} onChange={e => scrub(Number(e.target.value))}/></label><label className="playback-cadence"><span>切換節奏</span><select aria-label="播放切換節奏" value={cadence} onChange={e => setCadence(Number(e.target.value))}><option value="2500">慢</option><option value="1500">一般</option><option value="750">快</option></select></label></div>
        <div className="reference-current" aria-live={playing || preview ? 'off' : 'polite'}><small>{preview ? `暫看 · ${basisNames[preview.basis]}第 ${(shown?.index ?? 0) + 1} 步` : '目前呈現'}</small><strong>{shown?.event.title ?? '請選擇呈現步序'}</strong>{preview && <span>移開回到播放位置{playing ? '，繼續播放' : ''}</span>}</div>
        <details className="reference-model-note"><summary>步序與對應如何計算</summary><p>播放以呈現順序為基準；切換快慢只是閱讀節奏，沒有換算故事秒數。三線各自排序，靠同一事件建立對應，並非同一編號就是同一時刻。</p><p>觀眾的播放中狀態只沿用呈現線上已寫的觀眾狀態更新。獨立理解節點未指定播放時刻，不會自動當成已揭露資訊。</p></details>
      </section>
      <StoryTrackControls/>
      <PlotLineRows project={p} cursor={preview ?? cursor} onSelect={enter} onPreview={next => { if (!restoringFocus.current) setPreview(next); }}/>
      <div hidden={!layered}><LayeredView project={p} active={layered && !focus} cursor={cursor} previewCursor={preview} onSelect={enter} onPreview={next => { if (!restoringFocus.current) setPreview(next); }}/></div>
      {notice && <p role="status">{notice}</p>}
      <div className="overview-lanes" onPointerLeave={() => setPreview(null)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPreview(null); }}>
        {bases.map(basis => {
          const list = p.timelines[basis].placements, mapping = shown?.mappings.find(m => m.basis === basis);
          const candidates = mapping?.candidates ?? [];
          const entryItem = candidates.find(c => c.item.id === mapping?.exactId)?.item ?? (candidates.length === 1 ? candidates[0].item : undefined);
          return <section key={basis} className="overview-lane" data-overview-basis={basis} data-preview-row={preview?.basis === basis} data-mapping-status={mapping?.status ?? 'missing'}>
            <div className="overview-lane-heading"><h3><AtlasIcon name={basis}/>{axisTitles[basis]}</h3><small>{basis === 'reality' && p.realityTiming ? '閱讀排列（非時間刻度）' : basisNames[basis]} · {list.length} 節點</small><button onClick={e => { const item = entryItem; if (item) enter({ basis, occurrenceId: item.id }, e.currentTarget); }} disabled={!entryItem} title={candidates.length > 1 ? '有多個對應，請點選下方確切節點' : candidates.length ? '進入這條線的對應節點' : '請從事件軌選擇節點'} aria-label={`進入${axisTitles[basis]}`}>進入 ↗</button></div>
            <div className="overview-rail" onPointerMove={e => hoverRail(e, basis)} role="group" aria-label={`${axisTitles[basis]}事件軌`}><div className="overview-rail-line"/>{list.map((item, index) => {
              const exact = shown?.cursor.basis === basis && shown.item.id === item.id, related = shown?.item.eventId === item.eventId;
              return <button key={item.id} data-overview-occurrence={item.id} data-related={related} data-exact={exact} className={related ? 'is-related' : preview ? 'is-dimmed' : ''} aria-label={`${axisTitles[basis]}第 ${index + 1} 步：${p.units.find(u => u.id === item.eventId)?.title}；點選進入`} title={`${index + 1} · ${p.units.find(u => u.id === item.eventId)?.title}`} onPointerEnter={e => { if (e.pointerType !== 'touch') setPreview({ basis, occurrenceId: item.id }); }} onFocus={() => { if (!restoringFocus.current) setPreview({ basis, occurrenceId: item.id }); }} onClick={e => enter({ basis, occurrenceId: item.id }, e.currentTarget)} onKeyDown={e => { if (e.key === 'Escape') { setPreview(null); e.currentTarget.blur(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const nodes = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button'); nodes?.[Math.max(0, Math.min(list.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1)))]?.focus(); } }}><span>{index + 1}</span></button>;
            })}</div>
            <div className="overview-lane-summary">
              <div className="overview-mapping"><small>{mapping?.exactId ? '目前節點' : candidates.length === 0 ? '此事件尚無對應節點' : candidates.length > 1 ? `同一事件有 ${candidates.length} 個節點，尚未指定哪一次` : '同一事件的對應位置'}</small>{candidates.map(({ item, index }) => <button key={item.id} onClick={e => enter({ basis, occurrenceId: item.id }, e.currentTarget)}>第 {index + 1} 步 · {occurrenceMode[item.mode]} ↗</button>)}</div>
              {basis === 'reality' ? <div className="overview-state-grid">{shown?.characters.length ? shown.characters.map(s => <StateSummary key={s.track.id} state={s}/>) : <p>{shown?.mappings[0].status === 'unique' ? '尚未建立人物狀態軌' : '缺少世界順序對應，人物狀態未知'}</p>}</div> : basis === 'narrative' ? <p className="overview-presentation">{shown?.cursor.basis === 'narrative' ? readingSentence(shown.event, shown.item, 'narrative', p) : '暫看其他線的位置；這裡只標示同一事件的呈現節點，不推定播放時刻'}</p> : <div className="overview-audience-state"><small>{shown?.cursor.basis === 'narrative' ? '截至目前呈現 · 已寫觀眾狀態' : shown?.cursor.basis === 'audience' ? shown.item.audienceDesign ? '此理解節點 · 作者認知設定' : '截至暫看的理解節點 · 已寫觀眾狀態' : '世界順序沒有自動對應的觀眾時刻'}</small>{shown?.cursor.basis === 'audience' && shown.item.audienceDesign ? <div className="preview-cognition" data-cognition-source="exact-design">{(['knows', 'believes', 'questions'] as const).map((key, i) => <p key={key}><small>{['知道', '相信', '追問'][i]}：</small>{display(shown.item.audienceDesign!.cognition[key])}</p>)}<small>此理解節點的作者設定 · 第 {shown.index + 1} 步</small></div> : shown?.audience.map(s => <StateSummary key={s.track.id} state={s}/>)}{shown?.cursor.basis === 'narrative' && <small>上列理解節點未指定播放時刻，僅供對照</small>}</div>}
            </div>
            <StoryTrackRows p={p} basis={basis} occurrenceId={entryItem?.id} onSelect={enter}/>
            {basis === 'reality' && <RealityTimingSummary p={p} eventId={entryItem?.eventId}/>}
          </section>;
        })}
      </div>
      <div hidden={!spatial} className="navigator-spatial">{spatialTools}<Hologram onFlat={onFlat} referenceCursor={cursor} previewEventId={preview ? shown?.event.id : undefined}/></div>
    </div>
    {focus && <AxisDetail p={p} cursor={focus} onSelect={select} onBack={back}/>}
  </section>;
}
