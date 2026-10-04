import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://local.test' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement'] as const) Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { render, fireEvent, screen, cleanup, act } = await import('@testing-library/react');
const { useState } = await import('react');
const { default: LayeredView } = await import('./LayeredView');
const { createTimelineDemo } = await import('./sample');
import type { TimelineCursor } from './playback';
afterEach(() => cleanup());

test('three planar event rails expose repeated and missing correspondences', () => {
  const project = createTimelineDemo();
  render(<LayeredView project={project} cursor={{ basis: 'narrative', occurrenceId: 'narrative-opening' }} onSelect={() => {}}/>);
  assert.equal(document.querySelectorAll('[data-layered-basis]').length, 3);
  assert.equal(document.querySelectorAll('[data-layered-occurrence]').length, 40);
  assert.equal(document.querySelectorAll('[data-layered-reference="true"]').length, 1);
  assert.equal(document.querySelector('[data-layered-reference="true"]')!.getAttribute('data-layered-occurrence'), 'narrative-opening');
  assert.equal(document.querySelector('[data-layered-basis=audience]')!.getAttribute('data-mapping-status'), 'missing');
  assert.ok(screen.getByText('此事件尚無對應節點'));
  assert.ok(screen.getAllByText('同一事件 · 第 1 / 2 次').length >= 1);
  assert.ok(screen.getAllByText('同一事件 · 第 2 / 2 次').length >= 1);
});
test('enter delegates exact repeated cursor plus keyboard origin without editing the project', () => {
  const project = createTimelineDemo(), before = JSON.stringify(project); let selected: TimelineCursor | undefined, origin: HTMLElement | undefined;
  render(<LayeredView project={project} cursor={{ basis: 'narrative', occurrenceId: 'narrative-opening' }} onSelect={(c, element) => { selected = c; origin = element; }}/>);
  const repeat = document.querySelector<HTMLButtonElement>('[data-layered-occurrence=narrative-e9]')!;
  fireEvent.click(repeat);
  assert.deepEqual(selected, { basis: 'narrative', occurrenceId: 'narrative-e9' }); assert.equal(origin, repeat);
  assert.equal(JSON.stringify(project), before);
});
test('hover and keyboard preview are reversible and retain the reference diamond', () => {
  const project = createTimelineDemo(), before = JSON.stringify(project); let selected = 0;
  function Harness() { const [preview, setPreview] = useState<TimelineCursor | null>(null); return <LayeredView project={project} cursor={{ basis: 'narrative', occurrenceId: 'narrative-e9' }} previewCursor={preview} onPreview={setPreview} onSelect={() => { selected++; }}/>; }
  render(<Harness/>);
  const first = document.querySelectorAll<HTMLButtonElement>('[data-layered-basis=audience] [data-layered-occurrence]')[0];
  act(() => first.focus());
  assert.equal(document.querySelector('[data-layered-preview="true"]')!.getAttribute('data-layered-occurrence'), first.dataset.layeredOccurrence);
  assert.equal(document.querySelector('[data-layered-reference="true"]')!.getAttribute('data-layered-occurrence'), 'narrative-e9');
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  const next = document.querySelectorAll<HTMLButtonElement>('[data-layered-basis=audience] [data-layered-occurrence]')[1];
  assert.ok(document.activeElement === next);
  fireEvent.keyDown(next, { key: 'End' });
  assert.ok(document.activeElement === document.querySelectorAll('[data-layered-basis=audience] [data-layered-occurrence]')[6]);
  fireEvent.keyDown(document.activeElement!, { key: 'Home' }); assert.equal(document.activeElement, first);
  fireEvent.keyDown(first, { key: 'Escape' });
  assert.equal(document.querySelector('[data-layered-preview="true"]'), null);
  assert.equal(document.querySelector('[data-layered-exact="true"]')!.getAttribute('data-layered-occurrence'), 'narrative-e9');
  assert.equal(selected, 0); assert.equal(JSON.stringify(project), before);
});
test('mouse exit clears preview and touching a card does not require hover', () => {
  const project = createTimelineDemo(); let previews: (TimelineCursor | null)[] = [], selected: TimelineCursor | undefined;
  render(<LayeredView project={project} cursor={null} onPreview={c => previews.push(c)} onSelect={c => { selected = c; }}/>);
  const card = document.querySelector<HTMLButtonElement>('[data-layered-occurrence=narrative-opening]')!;
  // jsdom has no native PointerEvent; dispatch the real semantic event with pointerType.
  const touch = new window.Event('pointerover', { bubbles: true }); Object.defineProperty(touch, 'pointerType', { value: 'touch' });
  fireEvent(card, touch); assert.equal(previews.length, 0);
  fireEvent.click(card); assert.deepEqual(selected, { basis: 'narrative', occurrenceId: 'narrative-opening' });
  const mouse = new window.Event('pointerover', { bubbles: true }); Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
  fireEvent(card, mouse); assert.deepEqual(previews.at(-1), { basis: 'narrative', occurrenceId: 'narrative-opening' });
  fireEvent.pointerLeave(document.querySelector('.layered-view__planes')!); assert.equal(previews.at(-1), null);
});
test('local layer spacing leaves current occurrence and project data unchanged at phone width', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  const project = createTimelineDemo(), before = JSON.stringify(project); let selects = 0, previews = 0;
  render(<LayeredView project={project} cursor={{ basis: 'audience', occurrenceId: 'audience-disclosure-3' }} onSelect={() => { selects++; }} onPreview={() => { previews++; }}/>);
  fireEvent.click(screen.getByRole('button', { name: '緊密' }));
  assert.equal(screen.getByRole('region', { name: '2.5D 分層對照' }).getAttribute('data-layer-spacing'), 'compact');
  fireEvent.click(screen.getByRole('button', { name: '展開' }));
  assert.equal(screen.getByRole('region', { name: '2.5D 分層對照' }).getAttribute('data-layer-spacing'), 'spread');
  assert.equal(document.querySelector('[data-layered-exact="true"]')!.getAttribute('data-layered-occurrence'), 'audience-disclosure-3');
  assert.equal(selects, 0); assert.equal(previews, 0); assert.equal(JSON.stringify(project), before);
});
test('navigator-style hide and return preserves origin and independent lane scroll', () => {
  const project = createTimelineDemo(); let origin: HTMLElement | undefined, chosen: TimelineCursor | null = null;
  function Harness() { const [focus, setFocus] = useState(false); return <><div hidden={focus}><LayeredView project={project} cursor={{ basis: 'narrative', occurrenceId: 'narrative-opening' }} onSelect={(cursor, element) => { chosen = cursor; origin = element; setFocus(true); }}/></div>{focus && <button onClick={() => { setFocus(false); }}>返回</button>}</>; }
  render(<Harness/>);
  const card = document.querySelector<HTMLButtonElement>('[data-layered-occurrence=narrative-e9]')!, rail = card.closest<HTMLElement>('.layered-view__rail')!;
  rail.scrollLeft = 864; fireEvent.click(card); assert.deepEqual(chosen, { basis: 'narrative', occurrenceId: 'narrative-e9' });
  fireEvent.click(screen.getByRole('button', { name: '返回' })); act(() => origin?.focus({ preventScroll: true }));
  assert.equal(document.activeElement, card); assert.equal(rail.scrollLeft, 864);
});
test('missing reference and empty lanes use honest empty states', () => {
  const project = createTimelineDemo(); project.timelines.audience.placements = [];
  render(<LayeredView project={project} cursor={{ basis: 'narrative', occurrenceId: 'gone' }} onSelect={() => {}}/>);
  assert.ok(screen.getByText('這條線尚無節點')); assert.equal(screen.getAllByText('尚未選擇對照事件').length, 3);
  assert.equal(document.querySelector('[data-layered-exact="true"]'), null);
});
test('styles are scoped, keep text planar and provide phone touch targets without fixed canvas height', () => {
  const css = readFileSync(new URL('./layeredView.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(max-width:760px\)/); assert.match(css, /min-height:44px/);
  assert.match(css, /overflow-x:auto/); assert.match(css, /--layer-offset-mobile/);
  assert.doesNotMatch(css, /perspective\s*:|rotate[XY]\(|height:500px|height:600px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  for (const line of css.split('\n').filter(line => line.includes('{') && !line.trim().startsWith('@'))) assert.ok(line.trim().startsWith('.layered-view'), line);
});
test('reference following scrolls only its lane and preview never moves the rail', () => {
  const project = createTimelineDemo(), initial = { basis: 'narrative' as const, occurrenceId: 'narrative-opening' };
  const view = render(<LayeredView project={project} cursor={initial} onSelect={() => {}}/>);
  const rail = document.querySelector<HTMLElement>('[data-layered-basis=narrative] .layered-view__rail')!;
  Object.defineProperties(rail, { clientWidth: { configurable:true, value:500 }, scrollWidth:{ configurable:true, value:3600 } });
  const later = { basis: 'narrative' as const, occurrenceId:'narrative-e9' };
  view.rerender(<LayeredView project={project} cursor={later} onSelect={() => {}}/>);
  assert.ok(rail.scrollLeft > 0); const left = rail.scrollLeft;
  view.rerender(<LayeredView project={project} cursor={later} previewCursor={initial} onSelect={() => {}}/>);
  assert.equal(rail.scrollLeft, left);
  assert.equal(document.querySelector<HTMLElement>('[data-layered-basis=reality] .layered-view__rail')!.scrollLeft, 0);
});
test('stale preview metadata is cleared while the valid reference remains visible', () => {
  render(<LayeredView project={createTimelineDemo()} cursor={{basis:'narrative', occurrenceId:'narrative-opening'}} previewCursor={{basis:'audience',occurrenceId:'gone'}} onSelect={() => {}}/>);
  assert.equal(screen.queryByText('暫看中 · 移開回到播放基準'), null);
  assert.equal(document.querySelectorAll('[data-layered-exact=true]').length, 1);
});

test('first visible opening locates a distant reference without resetting a later Back scroll', () => {
  const project = createTimelineDemo(), cursor = { basis: 'narrative' as const, occurrenceId: 'narrative-e16' };
  const view = render(<LayeredView project={project} active={false} cursor={cursor} onSelect={() => {}}/>);
  const rail = document.querySelector<HTMLElement>('[data-layered-basis=narrative] .layered-view__rail')!;
  Object.defineProperties(rail, { clientWidth: { configurable: true, value: 500 }, scrollWidth: { configurable: true, value: 5000 } });
  view.rerender(<LayeredView project={project} active cursor={cursor} onSelect={() => {}}/>);
  assert.ok(rail.scrollLeft > 0); rail.scrollLeft = 777;
  view.rerender(<LayeredView project={project} active={false} cursor={cursor} onSelect={() => {}}/>);
  view.rerender(<LayeredView project={project} active cursor={cursor} onSelect={() => {}}/>);
  assert.equal(rail.scrollLeft, 777);
});
