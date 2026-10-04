import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://local.test",
});
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: dom.window.localStorage,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: dom.window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, "confirm", {
  value: () => true,
  configurable: true,
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { render: renderBase, fireEvent, screen, cleanup, act } =
  await import("@testing-library/react");
const { default: App } = await import("./App");
const { editor, saveNow, STORAGE_KEY } = await import("./store");
const { createSample, createTimelineDemo } = await import("./sample");
const { parseProject } = await import("./model");
const { narrativeTools, registerWebMCP } = await import("./webmcp");
// Existing feature regressions explicitly enter the preserved comparison workspace.
function renderRaw(element: React.ReactElement) {
  const result = renderBase(element);
  const initial = { outlineOpen: editor.getState().outlineOpen, inspectorOpen: editor.getState().inspectorOpen };
  fireEvent.click(screen.getByRole('button', { name: 'Compare story orders' }));
  act(() => editor.setState(initial));
  return result;
}
function render(element: React.ReactElement) {
  const result = renderRaw(element);
  fireEvent.click(screen.getByRole('button', {name:'Single timeline editor'}));
  return result;
}
function openSpatial() { const toggle = screen.queryByRole('button', { name: '顯示空間投影' }); if (toggle?.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle); }
function openCamera() { (document.querySelector('.camera-tools') as HTMLDetailsElement).open = true; }
beforeEach(() => {
  editor.setState({
    project: createSample(),
    past: [],
    future: [],
    selectedId: "e10",
    trackId: "author",
    playhead: 9.5,
    zoom: 12,
    panel: "cursor",
    basis: "narrative",
    occurrenceId: "narrative-e10",
    outlineOpen: true,
    inspectorOpen: true,
    notice: "",
  });
  localStorage.clear();
});
afterEach(() => cleanup());
test("React workspace renders semantic hierarchy and changing scale changes entity cards", () => {
  render(<App />);
  assert.equal(document.querySelectorAll(".event-card").length, 3);
  fireEvent.click(screen.getByRole("button", { name: "Beats" }));
  assert.equal(document.querySelectorAll(".event-card").length, 16);
  assert.equal(document.querySelectorAll(".scene-band").length, 8);
  fireEvent.click(screen.getByRole("button", { name: "Sequences" }));
  assert.equal(document.querySelectorAll(".event-card").length, 4);
});
test("scrub arbitrary position then switch perspective reads correct authored knowledge", () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Narrative position"), {
    target: { value: "2.2" },
  });
  fireEvent.change(screen.getByLabelText("View as perspective"), {
    target: { value: "lin" },
  });
  assert.equal(editor.getState().playhead, 2.2);
  assert.equal(document.querySelector(".state-label")!.textContent, "信任");
  fireEvent.change(screen.getByLabelText("Narrative position"), {
    target: { value: "2.7" },
  });
  assert.equal(document.querySelector(".state-label")!.textContent, "懷疑");
  assert.ok(screen.getByText("哥哥持有貨櫃封條；原因未知"));
});
test("edit title commits on blur, updates common event and supports undo/redo buttons", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Event" }));
  const field = screen.getByLabelText("Title");
  fireEvent.change(field, { target: { value: "A new shared title" } });
  fireEvent.blur(field);
  assert.equal(
    editor.getState().project.units.find((n) => n.id === "e10")!.title,
    "A new shared title",
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.equal(
    editor.getState().project.units.find((n) => n.id === "e10")!.title,
    "燈下的暗號",
  );
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  assert.equal(
    editor.getState().project.units.find((n) => n.id === "e10")!.title,
    "A new shared title",
  );
});
test("user review/approve creates immutable snapshot and later edits show needs review", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Stages" }));
  fireEvent.click(screen.getByRole("button", { name: /02Actor/ }));
  fireEvent.click(screen.getByRole("button", { name: "Request review" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve revision 1" }));
  let s = editor.getState().project.units.find((n) => n.id === "e10")!.stages;
  assert.equal(s.actor.approvals.length, 1);
  fireEvent.click(screen.getByRole("button", { name: /01Blueprint/ }));
  const field = screen.getByLabelText("Intent, arc and information goal");
  fireEvent.change(field, { target: { value: "Revised intent" } });
  fireEvent.blur(field);
  fireEvent.click(screen.getByRole("button", { name: /02Actor/ }));
  assert.ok(screen.getByText("Needs review"));
  s = editor.getState().project.units.find((n) => n.id === "e10")!.stages;
  assert.equal(s.actor.approvals.length, 1);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Request review",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
});
test("local save is parseable, retains edited state and versioned approval data", () => {
  render(<App />);
  act(() => {
    editor.getState().transact((p) => (p.title = "Saved project"));
    saveNow();
  });
  const saved = parseProject(localStorage.getItem(STORAGE_KEY)!);
  assert.equal(saved.title, "Saved project");
  assert.deepEqual(saved, editor.getState().project);
});
test("new track is editable and links to shared event without duplication", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Track" }));
  fireEvent.click(screen.getByRole("button", { name: "＋ Add perspective" }));
  const newId = editor.getState().trackId;
  assert.equal(editor.getState().project.tracks.length, 4);
  fireEvent.click(screen.getByRole("button", { name: "Event" }));
  fireEvent.click(
    screen.getByRole("button", { name: "＋ Link this shared event" }),
  );
  assert.ok(
    editor
      .getState()
      .project.transitions.some(
        (t) => t.trackId === newId && t.eventId === "e10",
      ),
  );
  assert.equal(
    editor.getState().project.units.filter((n) => n.kind === "beat").length,
    16,
  );
});
test("WebMCP tools register with lifecycle, navigate same state, reject invalid requests", () => {
  const registered: any[] = [];
  (document as any).modelContext = {
    registerTool: (tool: any, options: any) =>
      registered.push({ tool, options }),
  };
  const dispose = registerWebMCP();
  assert.deepEqual(
    registered.map((x) => x.tool.name),
    ["read_narrative_at_cursor", "navigate_narrative"],
  );
  assert.equal(registered[0].tool.annotations.readOnlyHint, true);
  act(() => narrativeTools[1].execute({ position: 10.4, trackId: "lin" }));
  assert.equal(editor.getState().playhead, 10.4);
  assert.equal(editor.getState().trackId, "lin");
  const result = narrativeTools[0].execute({}) as any;
  assert.equal(result.position, 10.4);
  assert.equal(
    result.tracks.find((t: any) => t.id === "lin").snapshot.state,
    "重新理解",
  );
  assert.throws(() => narrativeTools[1].execute({ position: 99 }), /outside/);
  assert.throws(
    () => narrativeTools[1].execute({ position: 3, trackId: "missing" }),
    /Unknown/,
  );
  assert.equal(editor.getState().playhead, 10.4);
  dispose();
  assert.ok(registered.every((x) => x.options.signal.aborted));
  delete (document as any).modelContext;
});

test("help dialog traps keyboard focus and Escape returns to editing", () => {
  render(<App />);
  const opener = screen.getByRole("button", { name: "Help" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Strand guide" });
  assert.ok(dialog);
  const first = screen.getByRole("button", { name: "Close help" });
  first.focus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  assert.equal(
    document.activeElement?.textContent,
    "Download source & README ↗",
  );
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
});
test("dragging an act in the timeline moves all descendants through the shared store", () => {
  render(<App />);
  const bands = [...document.querySelectorAll(".band-area>.container-band")];
  fireEvent.drop(bands[2], { dataTransfer: { getData: () => "a1" } });
  assert.equal(
    editor
      .getState()
      .project.units.filter((n) => n.kind === "act")
      .at(-1)!.id,
    "a1",
  );
  assert.ok(
    editor
      .getState()
      .project.transitions.some(
        (t) => t.eventId === "e10" && t.trackId === "lin",
      ),
  );
});

test("timeline switch changes actual occurrence counts and keeps perspective separate", () => {
  editor.setState({
    project: createTimelineDemo(),
    zoom: 87,
    playhead: 0.5,
    selectedId: "e9",
    occurrenceId: "narrative-opening",
    trackId: "lin",
  });
  render(<App />);
  assert.equal(document.querySelectorAll(".event-card").length, 17);
  fireEvent.click(screen.getByRole("button", { name: "Reality 16" }));
  assert.equal(editor.getState().basis, "reality");
  assert.equal(editor.getState().trackId, "lin");
  assert.equal(document.querySelectorAll(".event-card").length, 16);
  fireEvent.click(screen.getByRole("button", { name: "Audience 7" }));
  assert.equal(document.querySelectorAll(".event-card").length, 7);
  assert.equal(editor.getState().trackId, "lin");
});
test("Time inspector creates a repeated occurrence without changing world order", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Time" }));
  const before = JSON.stringify(editor.getState().project.timelines.reality);
  fireEvent.click(
    screen.getByRole("button", { name: "＋ Present this event again" }),
  );
  assert.equal(
    editor.getState().project.timelines.narrative.placements.length,
    17,
  );
  assert.equal(
    JSON.stringify(editor.getState().project.timelines.reality),
    before,
  );
  assert.equal(
    editor.getState().project.units.filter((n) => n.id === "e10").length,
    1,
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.equal(
    editor.getState().project.timelines.narrative.placements.length,
    16,
  );
});
test("Audience comparison authors a new snapshot and reads it back only on that basis", () => {
  editor.setState({
    basis: "audience",
    panel: "compare",
    selectedId: "e1",
    occurrenceId: "audience-e1",
    trackId: "audience",
    playhead: 0.5,
  });
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: "Author a change in understanding" }),
  );
  const input = screen.getByLabelText("State");
  fireEvent.change(input, { target: { value: "New audience belief" } });
  fireEvent.blur(input);
  assert.equal(
    editor.getState().project.timelines.audience.placements[0].updates[0].after
      .state,
    "New audience belief",
  );
  assert.equal(
    editor.getState().project.timelines.narrative.placements[0].updates.length,
    0,
  );
  fireEvent.click(screen.getByRole("button", { name: "At cursor" }));
  assert.equal(
    document.querySelector(".state-label")!.textContent,
    "New audience belief",
  );
});
test("Help contains direct academic sources and optional-guidance distinction", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  assert.equal(document.querySelectorAll(".sources-list a").length, 3);
  assert.match(
    document.querySelector(".sources-list")!.textContent!,
    /not a standard third timeline/,
  );
  assert.match(
    document.querySelector(".sources-list")!.textContent!,
    /no fixed plot formula/,
  );
});

test("mobile layout leaves time-basis switching available with panels closed", () => {
  const width = window.innerWidth;
  Object.defineProperty(window, "innerWidth", {
    value: 390,
    configurable: true,
  });
  editor.setState({ project: createTimelineDemo() });
  render(<App />);
  assert.equal(editor.getState().inspectorOpen, false);
  assert.equal(editor.getState().outlineOpen, false);
  assert.ok(screen.getByLabelText("Timeline basis"));
  fireEvent.change(screen.getByLabelText("Timeline basis"), { target: { value: "audience" } });
  assert.equal(editor.getState().basis, "audience");
  fireEvent.click(screen.getByRole("button", { name: /Compare timelines & timing/ }));
  assert.ok(screen.getByRole("heading", { name: "Time & disclosure" }));
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
});
test("WebMCP navigation validates and switches time basis without touching the project", () => {
  const before = JSON.stringify(editor.getState().project);
  act(() =>
    narrativeTools[1].execute({
      position: 2.5,
      basis: "audience",
      trackId: "audience",
    }),
  );
  assert.equal(editor.getState().basis, "audience");
  assert.equal(JSON.stringify(editor.getState().project), before);
  assert.throws(
    () => narrativeTools[1].execute({ position: 1, basis: "invalid" }),
    /Unknown time basis/,
  );
  assert.equal(editor.getState().basis, "audience");
});

function phone() {
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
}
function desktop() {
  Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
}
afterEach(desktop);

test("phone opens one full-width dialog and retains timeline scroll on dismissal", () => {
  phone(); render(<App />);
  const viewport = document.querySelector(".phone-card-rail")!;
  const before = editor.getState().occurrenceId;
  viewport.scrollLeft = 250;
  fireEvent.click(screen.getByRole("button", { name: /Structure/ }));
  assert.ok(screen.getByRole("dialog", { name: "Story structure" }));
  fireEvent.click(document.querySelector(".tree-title")!);
  assert.equal(screen.queryByRole("dialog", { name: "Story structure" }), null);
  assert.ok(screen.getByRole("dialog", { name: "Story details" }));
  assert.ok(document.querySelector(".timeline-main[inert]"));
  fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(document.querySelector(".phone-card-rail"));
  assert.ok(before);
});

test("phone event edit commits when Done dismisses the focused field and persists", () => {
  phone(); render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Details/ }));
  fireEvent.click(screen.getByRole("button", { name: "Event" }));
  const field = screen.getByLabelText("Title");
  field.focus();
  fireEvent.change(field, { target: { value: "Phone edit retained" } });
  fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
  assert.equal(editor.getState().project.units.find(n => n.id === "e10")!.title, "Phone edit retained");
  act(saveNow);
  const restored = parseProject(localStorage.getItem(STORAGE_KEY)!);
  assert.equal(restored.units.find(n => n.id === "e10")!.title, "Phone edit retained");
  cleanup();
  act(() => editor.setState({ project: restored }));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Details/ }));
  assert.equal((screen.getByLabelText("Title") as HTMLInputElement).value, "Phone edit retained");
});

test("phone has one focused perspective, readable cards, and explicit detail levels", () => {
  phone(); render(<App />);
  assert.equal(document.querySelector(".timeline-viewport"), null);
  assert.equal(document.querySelector(".workspace-bar"), null);
  assert.equal(document.querySelector(".basis-container"), null);
  assert.equal(document.querySelectorAll('.phone-card-slot[aria-hidden="false"]').length, 1);
  const before = JSON.stringify(editor.getState().project);
  fireEvent.change(screen.getByLabelText("View as perspective"), { target: { value: "lin" } });
  assert.equal(editor.getState().inspectorOpen, false);
  assert.ok(document.querySelector('.phone-card-slot[aria-hidden="false"] .phone-perspective'));
  assert.equal(document.querySelectorAll(".track-row").length, 0);
  for (const name of ["Story", "Sequences", "Scenes", "Beats"]) {
    fireEvent.change(screen.getByLabelText("Detail level"), { target: { value: name } });
    assert.equal((screen.getByLabelText("Detail level") as HTMLSelectElement).value, name);
    assert.equal(document.querySelectorAll('.phone-card-slot[aria-hidden="false"]').length, 1);
  }
  assert.equal(JSON.stringify(editor.getState().project), before);
});

function pointer(el: Element, type: string, x: number, y: number, id = 1) {
  const event = new window.Event(type, { bubbles: true });
  Object.assign(event, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, button: 0, buttons: 1 });
  fireEvent(el, event);
}
test("phone native swipe selects the nearest card without editing or opening a sheet", async () => {
  phone(); render(<App />);
  const rail = document.querySelector<HTMLElement>(".phone-card-rail")!;
  Object.defineProperty(rail, 'clientWidth', { value: 390 });
  const before = JSON.stringify(editor.getState().project);
  rail.scrollLeft = 390;
  await act(async () => { fireEvent.scroll(rail); await new Promise(r => setTimeout(r, 130)); });
  assert.equal(editor.getState().playhead, 1.5);
  assert.equal(editor.getState().inspectorOpen, false);
  assert.equal(JSON.stringify(editor.getState().project), before);
  fireEvent.click(screen.getByRole('button', { name: 'Event details' }));
  assert.equal(editor.getState().inspectorOpen, true);
});

test("phone navigation and jump change selection without opening editor or changing granularity", () => {
  phone(); render(<App />);
  const before = JSON.stringify(editor.getState().project);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  assert.equal(editor.getState().playhead, 10.5);
  assert.equal(editor.getState().selectedId, 'e11');
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  assert.equal(editor.getState().selectedId, 'e10');
  const jump = screen.getByLabelText('Jump to timeline card') as HTMLSelectElement;
  fireEvent.change(jump, { target: { value: jump.options[0].value } });
  assert.equal(editor.getState().playhead, .5);
  assert.equal((screen.getByRole('button', { name: 'Move earlier' }) as HTMLButtonElement).disabled, true);
  assert.equal(editor.getState().inspectorOpen, false);
  assert.equal(JSON.stringify(editor.getState().project), before);
});

test("phone visible move controls reorder only the active timeline and undo restores it", () => {
  phone(); editor.setState({ project: createTimelineDemo() }); render(<App />);
  const before = JSON.stringify(editor.getState().project.timelines.narrative.placements);
  const reality = JSON.stringify(editor.getState().project.timelines.reality);
  const facts = JSON.stringify(editor.getState().project.units.map(({ stages, ...facts }) => facts));
  const jump = screen.getByLabelText('Jump to timeline card') as HTMLSelectElement;
  fireEvent.change(jump, { target: { value: jump.options[1].value } });
  const selected = editor.getState().occurrenceId;
  fireEvent.click(screen.getByRole('button', { name: 'Move later' }));
  assert.notEqual(JSON.stringify(editor.getState().project.timelines.narrative.placements), before);
  assert.equal(editor.getState().occurrenceId, selected);
  assert.equal(editor.getState().playhead, 2.5);
  assert.equal(JSON.stringify(editor.getState().project.timelines.reality), reality);
  assert.equal(JSON.stringify(editor.getState().project.units.map(({ stages, ...facts }) => facts)), facts);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  assert.equal(JSON.stringify(editor.getState().project.timelines.narrative.placements), before);
});

test("phone edit is full-screen and accessible directly from the focused card", () => {
  phone(); render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  assert.ok(screen.getByRole('dialog', { name: 'Story details' }));
  assert.ok(screen.getByLabelText('Title'));
  fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(editor.getState().selectedId, 'e10');
});

test("phone project menu retains import, export and desktop restores side panels", () => {
  phone(); render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Project/ }));
  assert.ok(screen.getByRole("button", { name: "Import JSON" }));
  assert.ok(screen.getByRole("button", { name: "Export JSON ↗" }));
  fireEvent.keyDown(document, { key: "Escape" });
  desktop(); act(() => window.dispatchEvent(new window.Event("resize")));
  fireEvent.click(screen.getByRole("button", { name: "Toggle structure" }));
  fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));
  assert.ok(document.querySelector(".outline:not(.mobile-sheet)"));
  assert.ok(document.querySelector(".inspector:not(.mobile-sheet)"));
  assert.equal(screen.queryByRole("dialog"), null);
});

test('holographic view keeps projection separate from semantic zoom and edits the shared entity',()=>{
 render(<App />);const before=JSON.stringify(editor.getState().project);
 fireEvent.click(screen.getByRole('button',{name:'◈ 3D hologram'}));openSpatial();
 assert.ok(screen.getByRole('region',{name:'Holographic narrative viewer'}));
 fireEvent.click(screen.getByRole('button',{name:'Beats'}));
 const nodes=document.querySelectorAll('.holo-node');assert.equal(nodes.length,48);
 fireEvent.change(screen.getByLabelText('Timeline compression'),{target:{value:'100'}});
 assert.equal(document.querySelectorAll('.holo-node').length,48);assert.equal(JSON.stringify(editor.getState().project),before);assert.equal(editor.getState().past.length,0);
 const node=document.querySelector('.holo-node[data-event-id="e1"]')!;fireEvent.click(node);assert.equal(editor.getState().selectedId,'e1');
 fireEvent.click(screen.getByRole('button',{name:'Edit selected entity'}));assert.ok(screen.getByLabelText('Title'));
 fireEvent.click(screen.getByRole('button',{name:'2D editor'}));assert.equal(document.querySelectorAll('.event-card').length,16);
});
test('hologram correspondence exposes repeated occurrences and never mutates their order',()=>{
 editor.setState({project:createTimelineDemo(),selectedId:'e9',basis:'narrative',occurrenceId:'stale'});
 render(<App />);fireEvent.click(screen.getByRole('button',{name:'◈ 3D hologram'}));openSpatial();
 const before=JSON.stringify(editor.getState().project);
 const map=screen.getByLabelText('Shared event correspondence');assert.ok(map.textContent?.includes('present'));assert.ok(map.textContent?.includes('repeat'));assert.ok(map.textContent?.includes('Not mapped'));
 openCamera();fireEvent.click(screen.getByRole('button',{name:'Camera zoom in'}));fireEvent.click(screen.getByRole('button',{name:'Reset view'}));
 assert.equal(JSON.stringify(editor.getState().project),before);
});
test('3D touch orbit, pan and pinch change camera geometry without editing data',()=>{
 phone();render(<App />);fireEvent.click(screen.getByRole('button',{name:'3D overview'}));openSpatial();
 const svg=document.querySelector('.holo-surface svg')!;
 const geometry=()=>document.querySelector('.holo-node circle')?.getAttribute('cx');
 const before=geometry(), project=JSON.stringify(editor.getState().project);
 pointer(svg,'pointerdown',120,220);pointer(svg,'pointermove',180,250);pointer(svg,'pointerup',180,250);assert.notEqual(geometry(),before);
 openCamera();fireEvent.click(screen.getByRole('button',{name:'Pan'}));const orbit=geometry();pointer(svg,'pointerdown',120,220);pointer(svg,'pointermove',170,220);pointer(svg,'pointerup',170,220);assert.notEqual(geometry(),orbit);
 const pan=geometry();pointer(svg,'pointerdown',120,220,1);pointer(svg,'pointerdown',220,220,2);pointer(svg,'pointermove',320,220,2);pointer(svg,'pointerup',320,220,2);pointer(svg,'pointerup',120,220,1);assert.notEqual(geometry(),pan);
 assert.equal(JSON.stringify(editor.getState().project),project);desktop();
});
test('repeated occurrence has one exact focus ring and accessible pressed state',()=>{
 editor.setState({project:createTimelineDemo(),selectedId:'e9',basis:'narrative',occurrenceId:'narrative-e9',zoom:87});render(<App />);fireEvent.click(screen.getByRole('button',{name:'◈ 3D hologram'}));openSpatial();
 const exact=document.querySelectorAll('.holo-node.selected');assert.equal(exact.length,1);assert.equal(exact[0].getAttribute('data-occurrence-ids'),'narrative-e9');
 openCamera();fireEvent.click(screen.getByRole('button',{name:'Focus selection'}));assert.equal(document.querySelectorAll('.holo-node.selected').length,1);
});

test('phone changes reset reading position and preserve explicit occurrence identity across repeated events', () => {
  phone(); editor.setState({ project: createTimelineDemo() }); render(<App />);
  const jump = screen.getByLabelText('Jump to timeline card') as HTMLSelectElement;
  const list = editor.getState().project.timelines.narrative.placements;
  const repeated = list.find((n, i) => list.findIndex(x => x.eventId === n.eventId) !== i)!;
  const option = [...jump.options].find(o => o.value === repeated.id)!;
  fireEvent.change(jump, { target: { value: jump.options[0].value } });
  const reading = document.querySelector('.phone-reading')!;
  reading.scrollTop = 400;
  fireEvent.change(jump, { target: { value: option.value } });
  assert.equal(reading.scrollTop, 0);
  assert.equal(editor.getState().occurrenceId, repeated.id);
  assert.equal(editor.getState().selectedId, repeated.eventId);
  fireEvent.change(screen.getByLabelText('Timeline basis'), { target: { value: 'reality' } });
  assert.equal(editor.getState().selectedId, repeated.eventId);
  assert.equal(editor.getState().inspectorOpen, false);
});

test('phone container movement moves all its occurrences, remains undoable, and leaves other axes intact', () => {
  phone(); render(<App />);
  fireEvent.change(screen.getByLabelText('Detail level'), { target: { value: 'Scenes' } });
  const before = editor.getState().project;
  const jump = screen.getByLabelText('Jump to timeline card') as HTMLSelectElement;
  fireEvent.change(jump, { target: { value: jump.options[0].value } });
  const firstTwo = before.timelines.narrative.placements.slice(0, 2).map(x => x.id);
  fireEvent.click(screen.getByRole('button', { name: 'Move later' }));
  assert.deepEqual(editor.getState().project.timelines.narrative.placements.slice(2, 4).map(x => x.id), firstTwo);
  assert.deepEqual(editor.getState().project.timelines.reality, before.timelines.reality);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  assert.deepEqual(editor.getState().project, before);
});

for (const viewport of [390, 1440]) test(`three aligned timelines remain available at ${viewport}px with details closed`,()=>{
  Object.defineProperty(window,'innerWidth',{value:viewport,configurable:true});
  editor.setState({zoom:87,outlineOpen:false,inspectorOpen:false});
  const before=JSON.stringify(editor.getState().project);
  renderRaw(<App/>);
  assert.ok(screen.getByRole('region',{name:'Aligned narrative timelines'}));
  assert.equal(document.querySelectorAll('.event-card,.phone-event-card,.holo-node').length,0);
  assert.equal(document.querySelectorAll('.aligned-lane').length,3);
  assert.deepEqual([...document.querySelectorAll('.aligned-lane')].map(n=>n.getAttribute('data-basis')),['reality','narrative','audience']);
  assert.equal(document.querySelectorAll('.aligned-node').length,48);
  assert.ok(document.querySelectorAll('[data-container-kind="act"]').length>=3);
  assert.ok(document.querySelectorAll('[data-container-kind="scene"]').length>=8);
  assert.equal(editor.getState().inspectorOpen,false);
  fireEvent.click(document.querySelector('.aligned-node[data-event-id="e1"]')!);
  assert.equal(editor.getState().selectedId,'e1');
  assert.equal(editor.getState().inspectorOpen,false);
  fireEvent.click(screen.getByRole('button',{name:'Edit selected event'}));
  assert.equal(editor.getState().inspectorOpen,true);
  assert.equal(JSON.stringify(editor.getState().project),before);
});
test('hologram accessible reorder changes only selected axis and supports undo',()=>{
  editor.setState({zoom:87,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
  const before=editor.getState().project;
  (document.querySelector('.holo-more') as HTMLDetailsElement).open=true;
  fireEvent.click(screen.getByRole('button',{name:'Move earlier'}));
  assert.notDeepEqual(editor.getState().project.timelines.narrative,before.timelines.narrative);
  assert.deepEqual(editor.getState().project.timelines.reality,before.timelines.reality);
  assert.deepEqual(editor.getState().project.timelines.audience,before.timelines.audience);
  act(()=>editor.getState().undo());assert.deepEqual(editor.getState().project,before);
});

test('phone visual navigation selects adjacent entities without opening prose or mutating story',()=>{
  phone();editor.setState({zoom:87,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
  const before=JSON.stringify(editor.getState().project), previous=editor.getState().occurrenceId;
  fireEvent.click(screen.getByRole('button',{name:'Previous entity'}));
  assert.notEqual(editor.getState().occurrenceId,previous);
  fireEvent.click(screen.getByRole('button',{name:'Next entity'}));
  assert.equal(editor.getState().occurrenceId,previous);
  assert.equal(editor.getState().inspectorOpen,false);
  assert.equal(JSON.stringify(editor.getState().project),before);
});

test('audience experience uses discoverable controls, persists edits and returns linked selection to atlas',()=>{
 editor.setState({project:createTimelineDemo(),outlineOpen:false,inspectorOpen:false});
 render(<App />);
 fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
 assert.ok(screen.getByRole('region',{name:'Audience experience design'}));
 assert.match(document.body.textContent!,/作者設計範例/);
 fireEvent.click(screen.getByRole('button',{name:'編輯設計'}));
 fireEvent.change(screen.getByRole('spinbutton',{name:'緊張 intensity'}),{target:{value:'92'}});
 assert.equal(editor.getState().project.timelines.audience.placements.find(x=>x.id===editor.getState().occurrenceId)!.audienceDesign!.emotions.tension,92);
 act(()=>saveNow());assert.equal(parseProject(localStorage.getItem(STORAGE_KEY)!).timelines.audience.placements.find(x=>x.id===editor.getState().occurrenceId)!.audienceDesign!.emotions.tension,92);
 fireEvent.click(screen.getByRole('button',{name:'在空間圖定位'}));
 assert.equal(editor.getState().basis,'audience');assert.ok(!screen.queryByRole('region',{name:'Audience experience design'}));
});
test('audience design controls work at phone width and observed feedback stays separate',()=>{
 Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
 editor.setState({project:createTimelineDemo(),outlineOpen:false,inspectorOpen:false});
 renderRaw(<App />);
 fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
 const point=editor.getState().occurrenceId;
 const designed=JSON.stringify(editor.getState().project.timelines.audience.placements.find(x=>x.id===point)!.audienceDesign);
 fireEvent.click(screen.getByText('實際試映回饋 · 0 則'));
 fireEvent.change(screen.getByLabelText('回饋來源 / 試映場次'),{target:{value:'試映 A'}});
 fireEvent.change(screen.getByLabelText('實際觀察'),{target:{value:'兩位觀眾感到困惑'}});
 fireEvent.click(screen.getByRole('button',{name:'儲存實測回饋'}));
 const selected=editor.getState().project.timelines.audience.placements.find(x=>x.id===point)!;
 assert.equal(selected.audienceObservations?.[0].source,'試映 A');assert.equal(JSON.stringify(selected.audienceDesign),designed);
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));assert.equal(editor.getState().project.timelines.audience.placements.find(x=>x.id===point)!.audienceObservations,undefined);
 Object.defineProperty(window,'innerWidth',{value:1024,configurable:true});
});
test('audience feedback draft is occurrence-scoped and invalid save preserves text',()=>{
 editor.setState({project:createTimelineDemo(),outlineOpen:false,inspectorOpen:false});renderRaw(<App />);
 fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
 fireEvent.click(screen.getByText('實際試映回饋 · 0 則'));
 fireEvent.change(screen.getByLabelText('回饋來源 / 試映場次'),{target:{value:' '}});
 fireEvent.change(screen.getByLabelText('實際觀察'),{target:{value:'Keep failed draft'}});
 fireEvent.click(screen.getByRole('button',{name:'儲存實測回饋'}));
 assert.equal((screen.getByLabelText('實際觀察') as HTMLTextAreaElement).value,'Keep failed draft');
 const second=Array.from(document.querySelectorAll('.experience-nodes button')).find(x=>x.getAttribute('aria-pressed')==='false')!;
 fireEvent.click(second);assert.equal((screen.getByLabelText('實際觀察') as HTMLTextAreaElement).value,'');
});
test('import exits audience mode rather than showing mismatched axis and inspector',()=>{
 editor.setState({project:createTimelineDemo(),outlineOpen:false,inspectorOpen:false});renderRaw(<App />);
 fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
 assert.ok(screen.getByRole('region',{name:'Audience experience design'}));
 act(()=>editor.getState().importProject(createSample()));
 assert.equal(editor.getState().basis,'narrative');assert.ok(!screen.queryByRole('region',{name:'Audience experience design'}));
});
test('short audience scores center curve points over their equal-width occurrence cards',()=>{
 for(const count of [1,2,3]){
  const p=createTimelineDemo();p.timelines.audience.placements=p.timelines.audience.placements.slice(0,count);
  p.timelines.audience.placements.forEach(o=>{o.audienceDesign={emotions:{tension:50},cognition:{knows:'',believes:'',questions:''},supportIds:[],expectations:[]};});
  editor.setState({project:p,outlineOpen:false,inspectorOpen:false,basis:'narrative'});renderRaw(<App />);
  fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
  const points=document.querySelectorAll('.experience-scroll svg circle');assert.equal(points.length,count);
  points.forEach((point,i)=>assert.equal(Number(point.getAttribute('cx')),8+(i+.5)*(740-16)/count));
  assert.equal((document.querySelector('.experience-nodes') as HTMLElement).style.gridTemplateColumns,`repeat(${count},1fr)`);
  cleanup();
 }
});

test('empty audience design explains missing lines and offers explicit authoring without inventing values', () => {
  const p = createSample();
  editor.setState({ project: p, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  fireEvent.click(screen.getByRole('button', { name: '◎ 觀眾體驗 · 情緒／認知／預期' }));
  const before = JSON.stringify(editor.getState().project);
  assert.match(screen.getByLabelText('Emotion curve status').textContent!, /尚未設定情緒數值/);
  assert.equal(document.querySelectorAll('[data-emotion-segment]').length, 0);
  assert.equal(document.querySelectorAll('.experience-chart circle').length, 0);
  assert.match(document.querySelector('.expectation-caption')!.textContent!, /尚未設定預期/);
  fireEvent.click(screen.getByRole('button', { name: '填寫這一步的情緒' }));
  assert.ok(screen.getByRole('spinbutton', { name: '緊張 intensity' }));
  assert.equal(JSON.stringify(editor.getState().project), before);
});

test('audience chart shows adjacent segments, separate single points and explicit blank-gap semantics', () => {
  const p = createTimelineDemo();
  p.timelines.audience.placements.forEach(o => { o.audienceDesign = { emotions: {}, cognition: { knows: '', believes: '', questions: '' }, supportIds: [], expectations: [] }; });
  p.timelines.audience.placements[0].audienceDesign!.emotions = { tension: 0, sadness: 35 };
  p.timelines.audience.placements[1].audienceDesign!.emotions.tension = 100;
  p.timelines.audience.placements[3].audienceDesign!.emotions.tension = 45;
  editor.setState({ project: p, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  fireEvent.click(screen.getByRole('button', { name: '◎ 觀眾體驗 · 情緒／認知／預期' }));
  assert.equal(document.querySelectorAll('[data-emotion-segment="tension"]').length, 1);
  assert.equal(document.querySelectorAll('[data-emotion-series="tension"] circle').length, 3);
  assert.equal(document.querySelectorAll('[data-emotion-segment="sadness"]').length, 0);
  assert.equal(document.querySelectorAll('[data-emotion-series="sadness"] circle').length, 1);
  assert.match(document.querySelector('[data-emotion-summary="sadness"]')!.textContent!, /1 點 · 0 段/);
  assert.match(screen.getByLabelText('Emotion curve status').textContent!, /相鄰兩步.*單點.*空白處斷線/);
  assert.equal(document.querySelector('[data-emotion-series="tension"] circle')!.getAttribute('cy'), '205');
});

test('isolated authored audience points explain why no segments exist', () => {
  const p = createSample();
  for (const index of [0, 2]) p.timelines.audience.placements[index].audienceDesign = { emotions: { trust: 50 }, cognition: { knows: '', believes: '', questions: '' }, supportIds: [], expectations: [] };
  editor.setState({ project: p, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  fireEvent.click(screen.getByRole('button', { name: '◎ 觀眾體驗 · 情緒／認知／預期' }));
  assert.match(screen.getByLabelText('Emotion curve status').textContent!, /已有情緒點，還沒有可連接的線段/);
  assert.equal(document.querySelectorAll('.experience-chart circle').length, 2);
  assert.equal(document.querySelectorAll('[data-emotion-segment]').length, 0);
});

test('complete audience curve preview is read-only and preserves saved story, history and exact selection at phone and desktop sizes', () => {
  for (const width of [390, 1440]) {
    Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
    const p = createSample(); p.title = '我的原作';
    editor.setState({ project: p, outlineOpen: false, inspectorOpen: false, basis: 'narrative', occurrenceId: 'narrative-e10', selectedId: 'e10', past: [], future: [] });
    renderBase(<App />);
    fireEvent.click(screen.getByRole('button', { name: '◎ 觀眾體驗 · 情緒／認知／預期' }));
    act(() => saveNow());
    const state = editor.getState();
    const original = JSON.stringify({ project: state.project, past: state.past, future: state.future, occurrenceId: state.occurrenceId, selectedId: state.selectedId, basis: state.basis, playhead: state.playhead });
    const saved = localStorage.getItem(STORAGE_KEY);
    fireEvent.click(screen.getByRole('button', { name: '查看完整曲線示例' }));
    assert.equal(document.querySelectorAll('[data-emotion-segment]').length, 21);
    assert.equal(document.querySelectorAll('.expectation-ribbon').length, 3);
    assert.match(document.querySelector('.experience-preview-note')!.textContent!, /唯讀示例/);
    assert.equal(screen.queryByRole('button', { name: '編輯設計' }), null);
    assert.equal(screen.queryByRole('button', { name: '▶ 規則模擬' }), null);
    assert.equal(screen.queryByRole('button', { name: '儲存實測回饋' }), null);
    fireEvent.click(document.querySelectorAll('.experience-nodes button')[3]);
    fireEvent.click(document.querySelector('.support-links button')!);
    fireEvent.click(document.querySelector('.expectation-ribbon')!);
    assert.equal(document.querySelector('.experience-editor'), null);
    act(() => saveNow());
    const now = editor.getState();
    assert.equal(JSON.stringify({ project: now.project, past: now.past, future: now.future, occurrenceId: now.occurrenceId, selectedId: now.selectedId, basis: now.basis, playhead: now.playhead }), original);
    assert.equal(localStorage.getItem(STORAGE_KEY), saved);
    fireEvent.click(screen.getByRole('button', { name: '回到我的作品' }));
    assert.match(document.querySelector('.experience-heading')!.textContent!, /我的原作/);
    assert.equal(document.querySelectorAll('[data-emotion-segment]').length, 0);
    assert.ok(screen.getByRole('button', { name: '編輯設計' }));
    cleanup();
  }
  Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
});

test('line roles are an independent inspector with tap-start/tap-end mobile range editing',()=>{
  Object.defineProperty(window,'innerWidth',{value:390,writable:true,configurable:true});
  act(()=>editor.setState({outlineOpen:false,inspectorOpen:false,zoom:87}));renderRaw(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'Edit narrative lines'}));
  fireEvent.click(screen.getByRole('button',{name:'Create narrative line'}));
  assert.equal(editor.getState().project.narrativeLines!.length,1);
  assert.deepEqual(editor.getState().project.narrativeLines![0].eventIds,['e10']);
  fireEvent.click(screen.getByRole('button',{name:'＋ 角色'}));
  fireEvent.change(screen.getByLabelText('Role scope'),{target:{value:'range'}});
  assert.equal((screen.getByRole('button',{name:'儲存角色'}) as HTMLButtonElement).disabled,true);
  fireEvent.click(screen.getByRole('button',{name:/Range occurrence 1:/}));
  assert.equal(screen.getByRole('button',{name:'Pick role end'}).getAttribute('aria-pressed'),'true');
  fireEvent.click(screen.getByRole('button',{name:/Range occurrence 10:/}));
  fireEvent.change(screen.getByLabelText('Line prominence'),{target:{value:'sub'}});
  fireEvent.change(screen.getByLabelText('Line visibility'),{target:{value:'covert'}});
  fireEvent.click(screen.getByRole('button',{name:'儲存角色'}));
  const line=editor.getState().project.narrativeLines![0];
  assert.deepEqual(line.roles[0].scope,{kind:'range',startOccurrenceId:'narrative-e1',endOccurrenceId:'narrative-e10'});
  assert.equal(line.roles[0].basis,'narrative');assert.equal(line.roles[0].visibility,'covert');
  fireEvent.click(screen.getByRole('button',{name:'Close inspector'}));
  assert.ok(document.querySelector(`[data-line-id="${line.id}"]`));
  act(()=>editor.getState().undo());assert.equal(editor.getState().project.narrativeLines![0].roles.length,0);
  Object.defineProperty(window,'innerWidth',{value:1024,writable:true,configurable:true});
});

test('role draft cancellation changes no authored data; switching its basis requires new endpoints',()=>{
  act(()=>editor.setState({project:createTimelineDemo(),lineId:'line-evidence',panel:'lines',inspectorOpen:true}));renderRaw(<App/>);
  const before=JSON.stringify(editor.getState().project);fireEvent.click(screen.getByRole('button',{name:'＋ 角色'}));
  fireEvent.change(screen.getByLabelText('Role scope'),{target:{value:'range'}});
  fireEvent.click(screen.getByRole('button',{name:/Range occurrence 1:/}));fireEvent.click(screen.getByRole('button',{name:/Range occurrence 2:/}));
  fireEvent.change(screen.getByLabelText('Role time basis'),{target:{value:'audience'}});
  assert.equal(screen.getByRole('button',{name:'Pick role start'}).textContent,'起點 未選');
  assert.equal((screen.getByRole('button',{name:'儲存角色'}) as HTMLButtonElement).disabled,true);
  fireEvent.click(screen.getByRole('button',{name:'取消'}));assert.equal(JSON.stringify(editor.getState().project),before);
});

test('atlas line styling varies by occurrence and projection has no causal arrowheads',()=>{
  act(()=>editor.setState({project:createTimelineDemo(),lineId:'line-evidence',selectedId:'e1',occurrenceId:'audience-disclosure-0',basis:'audience',zoom:87,inspectorOpen:false,outlineOpen:false}));renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
  const first=document.querySelector('[data-line-occurrence="audience-disclosure-0"]')!,repeat=document.querySelector('[data-line-occurrence="audience-disclosure-3"]')!;
  assert.ok(first.getAttribute('data-role')!.includes('暗線'));assert.ok(repeat.getAttribute('data-role')!.includes('明線'));
  assert.equal(document.querySelectorAll('[data-edge-kind="temporal-order"]').length,3);
  assert.ok(document.querySelectorAll('[data-edge-kind="identity-projection"]').length>=4);
  document.querySelectorAll('[data-edge-kind="identity-projection"]').forEach(path=>assert.equal(path.getAttribute('marker-end'),null));
  assert.equal(document.querySelector('[data-canonical-source]')!.getAttribute('data-canonical-source'),'e1');
});

test('orbit gesture beginning on a role segment does not select or open the inspector',()=>{
  act(()=>editor.setState({project:createTimelineDemo(),lineId:'line-evidence',selectedId:'e10',zoom:87,inspectorOpen:false,outlineOpen:false}));renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
  const svg=screen.getByRole('group',{name:/Three dimensional narrative map/}),segment=document.querySelector('[data-line-occurrence="narrative-e1"]')!;
  const pointer=(type:string,x:number)=>{const event=new window.MouseEvent(type,{button:0,clientX:x,clientY:10,bubbles:true});Object.defineProperty(event,'pointerId',{value:9});return event;};
  fireEvent(segment,pointer('pointerdown',10));fireEvent(svg,pointer('pointermove',40));fireEvent(svg,pointer('pointerup',40));fireEvent.click(segment);
  assert.equal(editor.getState().selectedId,'e10');assert.equal(editor.getState().inspectorOpen,false);
});

test('reading-angle presets preserve identity and time; manual reset returns to free rotation',()=>{
  act(()=>editor.setState({project:createTimelineDemo(),selectedId:'e9',basis:'narrative',occurrenceId:'narrative-opening',playhead:.5,zoom:87,inspectorOpen:false,outlineOpen:false}));renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
  const before=JSON.stringify(editor.getState().project),group=screen.getByRole('group',{name:'Reading angles'});
  fireEvent.click(Array.from(group.querySelectorAll('button')).find(b=>b.textContent==='Audience')!);
  assert.equal(document.querySelector('.holo-surface')!.getAttribute('data-reading-view'),'audience');
  assert.equal(editor.getState().basis,'narrative');assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().playhead,.5);
  assert.equal(JSON.stringify(editor.getState().project),before);openCamera();fireEvent.click(screen.getByRole('button',{name:'Reset view'}));assert.equal(document.querySelector('.holo-surface')!.getAttribute('data-reading-view'),'free');
});

test('line current-role readout falls back to selected beat while preserving exact repeated occurrences',()=>{
  act(()=>editor.setState({project:createTimelineDemo(),lineId:'line-evidence',selectedId:'e1',basis:'audience',occurrenceId:'stale-occurrence',panel:'lines',inspectorOpen:true}));renderRaw(<App/>);
  assert.ok(document.querySelector('.line-current')!.textContent!.includes('暗線'));
  act(()=>editor.setState({occurrenceId:'audience-disclosure-3'}));assert.ok(document.querySelector('.line-current')!.textContent!.includes('明線'));
});

test('reading camera animation cancels on manual controls and reduced motion skips animation',()=>{
  const raf=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame'),cancel=Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame'),media=Object.getOwnPropertyDescriptor(window,'matchMedia');
  let scheduled=0,cancelled=0;
  Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>++scheduled,configurable:true});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>cancelled++,configurable:true});
  Object.defineProperty(window,'matchMedia',{value:()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}),configurable:true});
  try {
    renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();const group=screen.getByRole('group',{name:'Reading angles'});fireEvent.click(group.querySelectorAll('button')[0]);assert.equal(scheduled,1);openCamera();fireEvent.click(screen.getByRole('button',{name:'Camera zoom in'}));assert.equal(cancelled,1);assert.equal(document.querySelector('.holo-surface')!.getAttribute('data-reading-view'),'free');cleanup();
    Object.defineProperty(window,'matchMedia',{value:()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}),configurable:true});renderRaw(<App/>);fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();fireEvent.click(screen.getByRole('group',{name:'Reading angles'}).querySelectorAll('button')[2]);assert.equal(scheduled,1);assert.equal(document.querySelector('.holo-surface')!.getAttribute('data-reading-view'),'audience');cleanup();
  } finally {
    if(raf)Object.defineProperty(globalThis,'requestAnimationFrame',raf);else Reflect.deleteProperty(globalThis,'requestAnimationFrame');if(cancel)Object.defineProperty(globalThis,'cancelAnimationFrame',cancel);else Reflect.deleteProperty(globalThis,'cancelAnimationFrame');if(media)Object.defineProperty(window,'matchMedia',media);else Reflect.deleteProperty(window,'matchMedia');
  }
});

test('audience rule engine configures, runs, inspects, baselines and persists with undo',()=>{
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/觀眾體驗 · 情緒/}));
  fireEvent.click(screen.getByRole('button',{name:'▶ 規則模擬'}));
  assert.ok(screen.getByRole('region',{name:'Audience rule engine'}));
  fireEvent.click(screen.getByRole('button',{name:'加入五種示範規則'}));
  assert.equal(editor.getState().project.audienceEngine?.config.rules.length,6);
  fireEvent.click(screen.getByRole('button',{name:'▶ 重新運算'}));
  assert.ok(screen.getByText('計算完成'));
  fireEvent.click(screen.getByRole('button',{name:'保存為比較基準'}));
  assert.ok(editor.getState().project.audienceEngine?.baseline);
  const first=editor.getState().project.timelines.audience.placements[0];
  const firstButton=screen.getByRole('navigation',{name:'Audience simulation occurrences'}).querySelector('button')!;
  fireEvent.click(firstButton);
  assert.equal(editor.getState().occurrenceId,first.id);
  const firstRule=editor.getState().project.audienceEngine!.config.rules.find(r=>r.occurrenceId===first.id)!;
  const revisions=editor.getState().project.units.map(u=>u.stages.blueprint.revision);
  fireEvent.focus(screen.getByLabelText('Target '+firstRule.id));
  fireEvent.blur(screen.getByLabelText('Target '+firstRule.id));
  assert.deepEqual(editor.getState().project.units.map(u=>u.stages.blueprint.revision),revisions);
  fireEvent.change(screen.getByLabelText('Weight '+firstRule.id),{target:{value:'1.5'}});
  assert.ok(screen.getByText('設定已變更 · 結果待重算'));
  assert.ok(screen.getByText('設定或順序已變更，重算後再顯示曲線'));
  assert.equal((screen.getByRole('button',{name:'保存為比較基準'}) as HTMLButtonElement).disabled,true);
  act(()=>editor.getState().undo());
  assert.equal(editor.getState().project.audienceEngine!.config.rules.find(r=>r.id===firstRule.id)!.weight,1);
  act(()=>saveNow());
  const stored=parseProject(localStorage.getItem(STORAGE_KEY)!);
  assert.ok(stored.audienceEngine?.lastRun);
  assert.ok(stored.audienceEngine?.baseline);
});

test('audience engine marks unknown conditions and edits explicit seed without inventing observed feedback',()=>{
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/觀眾體驗 · 情緒/}));
  fireEvent.click(screen.getByRole('button',{name:'▶ 規則模擬'}));
  fireEvent.click(screen.getByRole('button',{name:'＋ 加入規則'}));
  fireEvent.click(screen.getByRole('button',{name:'＋ 加入條件'}));
  fireEvent.click(screen.getByRole('button',{name:'▶ 重新運算'}));
  assert.ok(screen.getByText('結果不完整 · 有未解輸入'));
  assert.ok(screen.getByText('尚未輸入觀眾回饋'));
  fireEvent.click(screen.getByRole('button',{name:'初始狀態／衰減'}));
  fireEvent.click(screen.getByRole('button',{name:'加入已知資訊'}));
  fireEvent.click(screen.getByRole('button',{name:'▶ 重新運算'}));
  assert.ok(screen.getByText('計算完成'));
  assert.ok(editor.getState().project.audienceEngine?.lastRun);
  assert.equal(editor.getState().project.timelines.audience.placements.some(o=>o.audienceObservations?.length),false);
});

test('audience simulation renders safe prototype-like target names without inherited state',()=>{
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/觀眾體驗 · 情緒/}));
  fireEvent.click(screen.getByRole('button',{name:'▶ 規則模擬'}));
  fireEvent.click(screen.getByRole('button',{name:'＋ 加入規則'}));
  const r=editor.getState().project.audienceEngine!.config.rules[0];
  fireEvent.change(screen.getByLabelText('Target '+r.id),{target:{value:'toString'}});
  fireEvent.blur(screen.getByLabelText('Target '+r.id));
  fireEvent.click(screen.getByRole('button',{name:'▶ 重新運算'}));
  assert.ok(screen.getByText('計算完成'));
  assert.ok(document.querySelector('.engine-state-card'));
  assert.ok(document.querySelector('.engine-state-card')?.textContent?.includes('未建立 → 0.40'));
});

// 2D-first comparison regression coverage. The older focus and 3D editors are
// reached explicitly above, while these exercise the actual initial workspace.
test('aligned selection highlights every repeat and missing lane without changing any order', () => {
  const p=createTimelineDemo(); editor.setState({project:p,selectedId:'e9',basis:'narrative',occurrenceId:'narrative-e9',outlineOpen:false,inspectorOpen:false});
  const before=JSON.stringify(p); renderRaw(<App/>);
  const expected=['reality','narrative','audience'].reduce((n,b)=>n+p.timelines[b as 'reality'].placements.filter(o=>o.eventId==='e9').length,0);
  assert.equal(document.querySelectorAll('.aligned-node[data-corresponding="true"]').length,expected);
  assert.equal(document.querySelectorAll('.aligned-node.is-selected').length,1);
  assert.equal(document.querySelector('.aligned-node.is-selected')!.getAttribute('data-occurrence-id'),'narrative-e9');
  assert.match(document.querySelector('.aligned-lane[data-basis="audience"] .aligned-lane-heading')!.textContent!,/未對應/);
  fireEvent.click(screen.getByRole('button',{name:'Go to Narrative occurrence 1'}));
  assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().basis,'narrative');assert.equal(editor.getState().playhead,.5);
  document.querySelectorAll('[data-edge-kind="event-correspondence"]').forEach(p=>assert.equal(p.getAttribute('marker-end'),null));
  assert.equal(JSON.stringify(editor.getState().project),before);
});

test('exact repeated Audience occurrence survives opening its design editor',()=>{
  const p=createTimelineDemo(),occ=p.timelines.audience.placements[3];
  editor.setState({project:p,selectedId:occ.eventId,basis:'audience',occurrenceId:occ.id,playhead:3.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  assert.match(screen.getByLabelText('Authored audience changes').textContent!,/Audience #4/);
  fireEvent.click(screen.getByRole('button',{name:'編輯觀眾設計'}));
  assert.equal(editor.getState().occurrenceId,occ.id);assert.equal(editor.getState().playhead,3.5);
  assert.ok(screen.getByRole('region',{name:'Audience experience design'}));
});

test('aligned phone pan preserves selection; previous next and jump move exact occurrences',()=>{
  phone();editor.setState({project:createTimelineDemo(),basis:'narrative',selectedId:'e9',occurrenceId:'narrative-opening',playhead:.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const before=JSON.stringify(editor.getState().project),rail=screen.getByLabelText('Pan all three timelines horizontally');
  rail.scrollLeft=480;fireEvent.scroll(rail);
  assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().playhead,.5);
  fireEvent.click(screen.getByRole('button',{name:'Next occurrence'}));
  assert.equal(editor.getState().playhead,1.5);
  fireEvent.click(screen.getByRole('button',{name:'Previous occurrence'}));assert.equal(editor.getState().occurrenceId,'narrative-opening');
  fireEvent.change(screen.getByLabelText('Jump to occurrence'),{target:{value:'narrative-e9'}});assert.equal(editor.getState().occurrenceId,'narrative-e9');
  assert.equal(document.querySelectorAll('.aligned-node.is-selected').length,1);
  assert.equal(editor.getState().inspectorOpen,false);assert.equal(JSON.stringify(editor.getState().project),before);
});

test('aligned reorder changes one occurrence on one axis and preserves exact selection through undo',()=>{
  phone();const p=createTimelineDemo();editor.setState({project:p,basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-3',playhead:3.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const before=editor.getState().project,occ=editor.getState().occurrenceId;
  fireEvent.click(screen.getByRole('button',{name:'Move selected occurrence earlier'}));
  assert.equal(editor.getState().occurrenceId,occ);assert.equal(editor.getState().playhead,2.5);
  assert.notDeepEqual(editor.getState().project.timelines.audience,before.timelines.audience);
  assert.deepEqual(editor.getState().project.timelines.reality,before.timelines.reality);
  assert.deepEqual(editor.getState().project.timelines.narrative,before.timelines.narrative);
  act(saveNow);const saved=parseProject(localStorage.getItem(STORAGE_KEY)!);assert.equal(saved.timelines.audience.placements[2].id,occ);
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));assert.deepEqual(editor.getState().project,before);
  assert.equal(document.querySelector('.aligned-node.is-selected')!.getAttribute('data-occurrence-id'),occ);
  assert.equal((screen.getByLabelText('Jump to occurrence') as HTMLSelectElement).value,occ);
  assert.equal(editor.getState().playhead,3.5);
});

test('aligned phone shared-event editing persists and returns to the same three lanes',()=>{
  phone();editor.setState({outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const occ=editor.getState().occurrenceId;
  fireEvent.click(screen.getByRole('button',{name:'Edit selected event'}));const title=screen.getByLabelText('Title');title.focus();fireEvent.change(title,{target:{value:'Shared title edited on phone'}});
  fireEvent.click(screen.getByRole('button',{name:'Close inspector'}));act(saveNow);
  assert.equal(editor.getState().occurrenceId,occ);
  assert.equal(document.querySelectorAll('.aligned-node[data-event-id="e10"]').length,3);
  document.querySelectorAll('.aligned-node[data-event-id="e10"]').forEach(n=>assert.match(n.textContent!,/Shared title edited on phone/));
  assert.equal(parseProject(localStorage.getItem(STORAGE_KEY)!).units.find(u=>u.id==='e10')!.title,'Shared title edited on phone');
});

test('aligned canvas handles empty mappings and long labels without inventing audience states',()=>{
  const p=createTimelineDemo();p.timelines.audience.placements=[];const long='很長的事件標題'.repeat(60);p.units.find(u=>u.id==='e9')!.title=long;
  editor.setState({project:p,selectedId:'e9',basis:'narrative',occurrenceId:'narrative-opening',outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  assert.match(document.querySelector('.aligned-empty-lane')!.textContent!,/尚無節點/);
  assert.ok(screen.getByRole('button',{name:`Narrative #1: ${long} · present · repeated event`}));
  assert.equal(document.querySelector('.aligned-node-title')!.getAttribute('style'),null);
  assert.match(screen.getByLabelText('Authored audience changes').textContent!,/此事件尚未對應/);
  assert.equal(document.querySelectorAll('.aligned-emotions b').length,0);
});

test('aligned audience summary separates authored deltas from stale rules and measured feedback',async()=>{
  const {runSimulation}=await import('./audienceSimulation');
  const p=createTimelineDemo();runSimulation(p);const occ=p.timelines.audience.placements[3];
  occ.audienceObservations=[{id:'feedback-one',source:'Screening A',note:'Actual observed reaction stays separate'}];
  editor.setState({project:p,basis:'audience',selectedId:occ.eventId,occurrenceId:occ.id,playhead:3.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const section=screen.getByLabelText('Authored audience changes');
  assert.match(section.textContent!,/作者設定範例/);assert.match(section.textContent!,/前一個 Audience 節點/);
  assert.match(section.textContent!,/實際試映回饋 · 1 則（獨立記錄）/);
  assert.equal(document.querySelector('[data-simulation-status]')!.getAttribute('data-simulation-status'),'current');
  assert.doesNotMatch(section.textContent!,/Actual observed reaction/);
  act(()=>editor.getState().transact(p=>{p.timelines.audience.placements[3].audienceDesign!.emotions.tension=73;}));
  assert.equal(document.querySelector('[data-simulation-status]')!.getAttribute('data-simulation-status'),'stale');
  assert.match(section.textContent!,/結果已過期，需重算/);assert.doesNotMatch(section.textContent!,/項狀態更新/);
});

test('optional 3D and focus editing preserve the main-view selected occurrence',()=>{
  editor.setState({project:createTimelineDemo(),basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-3',playhead:3.5,zoom:87,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const before=JSON.stringify(editor.getState().project);
  fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();assert.ok(screen.getByRole('region',{name:'Holographic narrative viewer'}));
  assert.equal(document.querySelector('.holo-node.selected')!.getAttribute('data-occurrence-ids'),'audience-disclosure-3');
  fireEvent.click(screen.getByRole('button',{name:'三線對照'}));assert.ok(screen.getByRole('region',{name:'Aligned narrative timelines'}));
  assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');assert.equal(JSON.stringify(editor.getState().project),before);
});

test('audience response checkpoint is shown even without a new design object at its destination', async()=>{
  const {emptyAudienceDesign}=await import('./audience');const p=createTimelineDemo();
  const source=p.timelines.audience.placements[0],target=p.timelines.audience.placements[1];
  source.audienceDesign=emptyAudienceDesign();source.audienceDesign.expectations=[{id:'response-without-design',kind:'hope',text:'The earlier promise resolves here',response:'realized',responseId:target.id}];
  delete target.audienceDesign;
  editor.setState({project:p,basis:'audience',selectedId:target.eventId,occurrenceId:target.id,playhead:1.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const section=screen.getByLabelText('Authored audience changes');assert.match(section.textContent!,/The earlier promise resolves here/);assert.match(section.textContent!,/此處 · 實現/);
  assert.equal(section.querySelectorAll('.aligned-emotions b').length,0);assert.match(section.textContent!,/未設定 → 未設定/);
});

test('unmapped audience edit stays disabled instead of switching to an unrelated event',()=>{
  const p=createTimelineDemo();p.timelines.audience.placements=p.timelines.audience.placements.filter(o=>o.eventId!=='e1');
  editor.setState({project:p,basis:'reality',selectedId:'e1',occurrenceId:'reality-e1',playhead:.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const button=screen.getByRole('button',{name:'編輯觀眾設計'}) as HTMLButtonElement;
  assert.equal(button.disabled,true);fireEvent.click(button);assert.equal(editor.getState().selectedId,'e1');assert.equal(editor.getState().basis,'reality');
  fireEvent.click(screen.getByRole('button',{name:'時間對應'}));assert.equal(editor.getState().selectedId,'e1');assert.equal(editor.getState().panel,'compare');
});

for (const viewport of [390,1440]) test(`story-first default at ${viewport}px provides premise and one reading order`,()=>{
  Object.defineProperty(window,'innerWidth',{value:viewport,configurable:true});
  editor.setState({project:createTimelineDemo(),basis:'reality',selectedId:'e1',occurrenceId:'reality-e1',playhead:.5,outlineOpen:false,inspectorOpen:false});
  const before=JSON.stringify(editor.getState().project);renderBase(<App/>);
  assert.ok(screen.getByRole('region',{name:'Story reading workspace'}));
  assert.equal(document.querySelectorAll('.aligned-lane,.holo-node,.event-card').length,0);
  assert.match(document.querySelector('.story-premise')!.textContent!,/女孩誤把哥哥的保護/);
  assert.equal(document.querySelectorAll('.reading-tabs button[aria-pressed="true"]').length,1);
  assert.equal(document.querySelector('.story-route')!.hasAttribute('open'),viewport>760);
  assert.equal(editor.getState().inspectorOpen,false);assert.equal(JSON.stringify(editor.getState().project),before);
});
test('reader e8 makes authored cause action result visible without opening a tool',()=>{
  editor.setState({project:createTimelineDemo(),basis:'reality',selectedId:'e8',occurrenceId:'reality-e8',playhead:7.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  const detail=screen.getByLabelText('Readable selected event');
  assert.match(detail.querySelector('[data-story-part="cause"]')!.textContent!,/對質/);
  assert.match(detail.querySelector('[data-story-part="action"]')!.textContent!,/鎖住/);
  assert.match(detail.querySelector('[data-story-part="outcome"]')!.textContent!,/逃生/);
  assert.match(detail.textContent!,/以掌控抵抗不安|阻止他離開/);
  assert.equal(editor.getState().inspectorOpen,false);
});
test('reader missing cause stays unknown instead of turning sequence into causation',()=>{
  const p=createSample();delete p.units.find(u=>u.id==='e8')!.storyLogic;
  editor.setState({project:p,basis:'reality',selectedId:'e8',occurrenceId:'reality-e8',outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  assert.match(screen.getByLabelText('Authored cause action outcome').textContent!,/相鄰事件不一定互為因果/);
  assert.equal(document.querySelector('.cause-reference'),null);
});
test('read-only complete example preserves original project, history, selection and saved JSON',()=>{
  const p=createSample();p.title='我的作品';delete p.sampleKind;p.units.forEach(u=>delete u.storyLogic);
  editor.setState({project:p,basis:'reality',selectedId:'e8',occurrenceId:'reality-e8',playhead:7.5,outlineOpen:false,inspectorOpen:false});
  localStorage.setItem(STORAGE_KEY,JSON.stringify(p));const before=JSON.stringify(editor.getState().project),past=editor.getState().past;
  renderBase(<App/>);fireEvent.click(screen.getByRole('button',{name:'閱讀完整示例'}));
  assert.match(document.querySelector('.sample-preview-notice')!.textContent!,/沒有被替換/);
  assert.equal(screen.queryByRole('button',{name:'編輯這個事件'}),null);
  fireEvent.click(screen.getByRole('button',{name:'閱讀下一個事件'}));
  fireEvent.click(screen.getByRole('button',{name:'回到我的作品'}));
  assert.equal(editor.getState().occurrenceId,'reality-e8');assert.equal(JSON.stringify(editor.getState().project),before);assert.equal(editor.getState().past,past);assert.equal(localStorage.getItem(STORAGE_KEY),before);
});
test('reader narrative editor changes only the selected presentation and visibly updates it',()=>{
  const p=createTimelineDemo();editor.setState({project:p,basis:'narrative',selectedId:'e9',occurrenceId:'narrative-opening',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'編輯這次呈現'}));const field=screen.getByLabelText('這次呈現什麼');fireEvent.change(field,{target:{value:'新的冷開場，只展示危機'}});fireEvent.blur(field);
  assert.equal(editor.getState().project.timelines.narrative.placements[0].note,'新的冷開場，只展示危機');
  assert.equal(editor.getState().project.units.find(u=>u.id==='e9')!.summary,p.units.find(u=>u.id==='e9')!.summary);
  assert.notEqual(editor.getState().project.timelines.narrative.placements.find(o=>o.id==='narrative-e9')!.note,'新的冷開場，只展示危機');
  assert.match(document.querySelector('.story-presentation')!.textContent!,/新的冷開場/);
});
test('reader modern audience edit updates exact repeat and invalidates approval',async()=>{
  const {reviewStage,approveStage}=await import('./model');const p=createTimelineDemo();reviewStage(p,'story','blueprint');approveStage(p,'story','blueprint');
  editor.setState({project:p,basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-3',playhead:3.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  const revision=p.timelines.audience.revision;fireEvent.click(screen.getByRole('button',{name:'編輯這步理解'}));
  const field=screen.getByLabelText('這一步觀眾知道什麼');fireEvent.change(field,{target:{value:'現在才確認這是求救訊號'}});fireEvent.blur(field);
  const after=editor.getState().project;assert.equal(after.timelines.audience.placements[3].audienceDesign!.cognition.knows,'現在才確認這是求救訊號');
  assert.notEqual(after.timelines.audience.placements[0].audienceDesign!.cognition.knows,'現在才確認這是求救訊號');
  assert.ok(after.timelines.audience.revision>revision);assert.equal(after.units.find(u=>u.id==='story')!.stages.blueprint.status,'draft');
  assert.match(document.querySelector('.story-understanding')!.textContent!,/現在才確認/);
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));assert.deepEqual(editor.getState().project,p);
});
test('reader legacy audience update is shown and explicit blank modern value remains blank',()=>{
  const p=createSample();editor.setState({project:p,basis:'audience',selectedId:'e5',occurrenceId:'audience-e5',playhead:4.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  assert.match(document.querySelector('.story-understanding')!.textContent!,/目的仍未知/);
  cleanup();const d=createTimelineDemo();d.timelines.audience.placements[0].audienceDesign!.cognition.knows='';d.timelines.audience.placements[0].knowledgeNote='Do not resurrect this';
  editor.setState({project:d,basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-0'});renderBase(<App/>);
  assert.doesNotMatch(document.querySelector('.story-understanding')!.textContent!,/Do not resurrect this/);
});
test('reader expectation distinguishes a future planned reversal from current understanding',()=>{
  editor.setState({project:createTimelineDemo(),basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-0',outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  assert.match(document.querySelector('.reader-expectations')!.textContent!,/預計第 3 個理解節點反轉/);
  fireEvent.click(screen.getByRole('button',{name:'閱讀下一個事件'}));fireEvent.click(screen.getByRole('button',{name:'閱讀下一個事件'}));
  assert.match(document.querySelector('.reader-expectations')!.textContent!,/此處反轉/);
});
test('reader never opens unrelated audience event when its selected event is unmapped',()=>{
  editor.setState({project:createTimelineDemo(),basis:'reality',selectedId:'e9',occurrenceId:'reality-e9',playhead:8.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  (document.querySelector('.reader-more') as HTMLDetailsElement).open=true;
  const button=screen.getByRole('button',{name:'編輯觀眾情緒與預期'}) as HTMLButtonElement;assert.equal(button.disabled,true);fireEvent.click(button);
  assert.equal(editor.getState().selectedId,'e9');assert.equal(editor.getState().basis,'reality');
});
test('reader cause editing autosaves, invalidates blueprint, and undo restores authored structure',()=>{
  const p=createTimelineDemo();editor.setState({project:p,basis:'reality',selectedId:'e8',occurrenceId:'reality-e8',playhead:7.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'編輯這個事件'}));const field=screen.getByLabelText('為什麼發生');fireEvent.change(field,{target:{value:'林害怕再次被蒙在鼓裡'}});fireEvent.blur(field);act(saveNow);
  assert.equal(parseProject(localStorage.getItem(STORAGE_KEY)!).units.find(u=>u.id==='e8')!.storyLogic!.cause,'林害怕再次被蒙在鼓裡');
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));assert.deepEqual(editor.getState().project,p);
});
test('clearing legacy audience knowledge creates an explicit blank override without resurrecting old text',()=>{
  const p=createSample();editor.setState({project:p,basis:'audience',selectedId:'e5',occurrenceId:'audience-e5',playhead:4.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'編輯這步理解'}));const field=screen.getByLabelText('這一步觀眾知道什麼');assert.match((field as HTMLTextAreaElement).value,/目的仍未知/);
  fireEvent.change(field,{target:{value:''}});fireEvent.blur(field);
  const item=editor.getState().project.timelines.audience.placements.find(o=>o.id==='audience-e5')!;
  assert.equal(item.audienceDesign!.cognition.knows,'');assert.equal(item.audienceDesign!.cognition.believes,p.timelines.audience.placements.find(o=>o.id==='audience-e5')!.updates[0].interpretation);
  assert.doesNotMatch(document.querySelector('.reader-cognition section')!.textContent!,/目的仍未知/);
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));assert.deepEqual(editor.getState().project,p);
});
test('presentation routes label containers and do not reveal world scene summaries',()=>{
  const p=createTimelineDemo();editor.setState({project:p,basis:'narrative',selectedId:'e9',occurrenceId:'narrative-opening',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  assert.match(document.querySelector('.story-event-heading')!.textContent!,/呈現段落/);
  assert.doesNotMatch(document.querySelector('.story-route')!.textContent!,/阿澤秘密求救，把藏有證據的船票/);
});
test('active reading tab preserves exact repeated occurrence and filtered route',()=>{
  editor.setState({project:createTimelineDemo(),basis:'audience',selectedId:'e1',occurrenceId:'audience-disclosure-3',playhead:3.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
  fireEvent.click(screen.getByRole('button',{name:/^觀眾怎麼理解/}));assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');assert.equal(editor.getState().playhead,3.5);
  assert.match(document.querySelector('.story-understanding')!.textContent!,/最初的燈已在求救/);
});

for (const viewport of [390, 1440]) test(`reader inline edit focuses exact field and Done saves and returns at ${viewport}px`, () => {
  Object.defineProperty(window, 'innerWidth', { value: viewport, configurable: true });
  const p = createTimelineDemo();
  editor.setState({ project: p, basis: 'reality', selectedId: 'e8', occurrenceId: 'reality-e8', playhead: 7.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  const reader = screen.getByRole('region', { name: 'Story reading workspace' });
  reader.scrollTop = 347;
  const origin = screen.getByRole('button', { name: '編輯造成什麼結果' });
  fireEvent.click(origin);
  const field = screen.getByLabelText('造成什麼結果');
  assert.equal(document.activeElement, field);
  fireEvent.change(field, { target: { value: '這個選擇讓雙方都付出代價' } });
  reader.scrollTop = 700;
  fireEvent.click(document.querySelector('.reader-edit-actions button')!);
  assert.equal(screen.queryByLabelText('Edit story logic'), null);
  assert.equal(editor.getState().project.units.find(u => u.id === 'e8')!.storyLogic!.outcome, '這個選擇讓雙方都付出代價');
  assert.equal(editor.getState().occurrenceId, 'reality-e8'); assert.equal(editor.getState().playhead, 7.5);
  assert.equal(reader.scrollTop, 347); assert.equal(document.activeElement, origin);
});

test('reader Escape commits one field and preserves exact repeated audience occurrence', () => {
  const p = createTimelineDemo();
  editor.setState({ project: p, basis: 'audience', selectedId: 'e1', occurrenceId: 'audience-disclosure-3', playhead: 3.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  const reader = screen.getByRole('region', { name: 'Story reading workspace' }); reader.scrollTop = 241;
  const origin = screen.getByRole('button', { name: '編輯相信的解釋' }); fireEvent.click(origin);
  const field = screen.getByLabelText('這一步觀眾相信什麼'); assert.equal(document.activeElement, field);
  fireEvent.change(field, { target: { value: '這次才相信那是求救' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  assert.equal(editor.getState().past.length, 1);
  assert.equal(editor.getState().occurrenceId, 'audience-disclosure-3'); assert.equal(editor.getState().playhead, 3.5);
  assert.equal(editor.getState().project.timelines.audience.placements[3].audienceDesign!.cognition.believes, '這次才相信那是求救');
  assert.deepEqual(editor.getState().project.timelines.audience.placements[0], p.timelines.audience.placements[0]);
  assert.equal(reader.scrollTop, 241); assert.equal(document.activeElement, origin);
  assert.equal(screen.queryByLabelText('Edit story logic'), null);
});

test('empty-field navigator is collapsed, optional and focuses the exact editable gap', async () => {
  const { createBlankProject } = await import('./model'); const p = createBlankProject();
  const first = p.timelines.reality.placements[0];
  editor.setState({ project: p, basis: 'reality', selectedId: first.eventId, occurrenceId: first.id, playhead: .5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  const gaps = document.querySelector('.reader-gaps') as HTMLDetailsElement;
  assert.equal(gaps.open, false); assert.equal(gaps.querySelectorAll('button').length, 3);
  assert.match(gaps.textContent!, /不是必填清單/); assert.doesNotMatch(gaps.textContent!, /承接哪個事件/);
  gaps.open = true;
  fireEvent.click(Array.from(gaps.querySelectorAll('button')).find(b => b.textContent!.includes('為什麼發生'))!);
  assert.equal(document.activeElement, screen.getByLabelText('為什麼發生'));
  fireEvent.change(document.activeElement!, { target: { value: '因為收到一封信' } });
  fireEvent.click(document.querySelector('.reader-edit-actions button')!);
  assert.equal(document.querySelector('.reader-gaps')!.querySelectorAll('button').length, 2);
  assert.equal(editor.getState().project.tracks.length, 0);
  assert.equal(editor.getState().project.units.find(u => u.id === first.eventId)!.storyLogic?.causeEventId, undefined);
});

test('inline character motivation shows its inherited source and edits that source without moving the cursor', async () => {
  const { readingContext } = await import('./storyReading'); const p = createTimelineDemo();
  const item = p.timelines.reality.placements[7];
  const c = readingContext(p, item, 'reality').characters.find(c => c.track.id === 'lin')!;
  editor.setState({ project: p, basis: 'reality', selectedId: 'e8', occurrenceId: 'reality-e8', playhead: 7.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  const group = screen.getByRole('group', { name: 'Read character perspective' });
  fireEvent.click(Array.from(group.querySelectorAll('button')).find(b => b.textContent === c.track.name)!);
  const origin = screen.getByRole('button', { name: `編輯${c.track.name}的動機` }); fireEvent.click(origin);
  assert.match(document.querySelector('.reader-source-note')!.textContent!, /修改會影響沿用/);
  assert.match(document.querySelector('.reader-source-note')!.textContent!, new RegExp(p.units.find(u => u.id === c.beforeSourceEventId)!.title));
  const field = screen.getByLabelText('推動他的需要'); assert.equal(document.activeElement, field);
  fireEvent.change(field, { target: { value: '不再接受含糊的答案' } });
  fireEvent.click(document.querySelector('.reader-edit-actions button')!);
  assert.equal(editor.getState().project.transitions.find(t => t.eventId === c.beforeSourceEventId && t.trackId === 'lin')!.after.motivation, '不再接受含糊的答案');
  assert.deepEqual(editor.getState().project.transitions.find(t => t.eventId === 'e8' && t.trackId === 'lin'), p.transitions.find(t => t.eventId === 'e8' && t.trackId === 'lin'));
  assert.equal(editor.getState().occurrenceId, 'reality-e8'); assert.equal(editor.getState().inspectorOpen, false);
});

test('opening a character reaction editor does not create a transition; saving creates only that character', () => {
  const p = createTimelineDemo(), track = p.tracks.find(t => t.id === 'lin')!;
  p.transitions = p.transitions.filter(t => !(t.trackId === 'lin' && t.eventId === 'e8'));
  editor.setState({ project: p, basis: 'reality', selectedId: 'e8', occurrenceId: 'reality-e8', playhead: 7.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />);
  fireEvent.click(Array.from(screen.getByRole('group', { name: 'Read character perspective' }).querySelectorAll('button')).find(b => b.textContent === track.name)!);
  fireEvent.click(screen.getByRole('button', { name: `編輯${track.name}的反應` }));
  assert.equal(editor.getState().past.length, 0); assert.deepEqual(editor.getState().project, p);
  fireEvent.keyDown(screen.getByLabelText('採取的反應'), { key: 'Escape' });
  assert.deepEqual(editor.getState().project, p);
  fireEvent.click(screen.getByRole('button', { name: `編輯${track.name}的反應` }));
  fireEvent.change(screen.getByLabelText('採取的反應'), { target: { value: '請對方把話說完整' } });
  fireEvent.click(document.querySelector('.reader-edit-actions button')!);
  assert.equal(editor.getState().project.transitions.length, p.transitions.length + 1);
  assert.equal(editor.getState().project.transitions.find(t => t.trackId === 'lin' && t.eventId === 'e8')!.reaction, '請對方把話說完整');
});

test('changing edit targets retains the original return context and saves both focused drafts', () => {
  editor.setState({ project: createTimelineDemo(), basis: 'reality', selectedId: 'e8', occurrenceId: 'reality-e8', playhead: 7.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />); const reader = screen.getByRole('region', { name: 'Story reading workspace' }); reader.scrollTop = 135;
  const origin = screen.getByRole('button', { name: '編輯為什麼發生' }); fireEvent.click(origin);
  fireEvent.change(screen.getByLabelText('為什麼發生'), { target: { value: '先寫原因' } });
  reader.scrollTop = 600; fireEvent.click(screen.getByRole('button', { name: '編輯發生什麼' }));
  assert.equal(document.activeElement, screen.getByLabelText('發生什麼'));
  fireEvent.change(document.activeElement!, { target: { value: '再寫行動' } });
  fireEvent.click(document.querySelector('.reader-edit-actions button')!);
  const event = editor.getState().project.units.find(u => u.id === 'e8')!;
  assert.equal(event.summary, '再寫行動'); assert.equal(event.storyLogic!.cause, '先寫原因');
  assert.equal(reader.scrollTop, 135); assert.equal(document.activeElement, origin);
});

test('same-ID import discards an unsaved reader draft instead of overwriting the imported story', () => {
  const p = createTimelineDemo();
  editor.setState({ project: p, basis: 'reality', selectedId: 'e8', occurrenceId: 'reality-e8', playhead: 7.5, outlineOpen: false, inspectorOpen: false }); renderBase(<App />);
  fireEvent.click(screen.getByRole('button', { name: '編輯為什麼發生' }));
  fireEvent.change(screen.getByLabelText('為什麼發生'), { target: { value: '不要儲存的舊草稿' } });
  const imported = structuredClone(p); imported.title = '匯入的另一個故事';
  act(() => editor.getState().importProject(imported));
  assert.equal(screen.queryByLabelText('Edit story logic'), null);
  assert.deepEqual(editor.getState().project, imported);
  assert.equal(editor.getState().past.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' })); assert.deepEqual(editor.getState().project, p);
});

test('read-only sample has no gap or field edits and returns to the original story for writing', () => {
  const p = createSample(); p.title = '這是我的作品';
  editor.setState({ project: p, basis: 'narrative', selectedId: 'e9', occurrenceId: 'narrative-e9', playhead: 8.5, outlineOpen: false, inspectorOpen: false });
  renderBase(<App />); fireEvent.click(screen.getByRole('button', { name: '閱讀完整示例' }));
  assert.equal(document.querySelectorAll('.reader-inline-edit,.reader-gaps,.reader-edit').length, 0);
  fireEvent.click(screen.getByRole('button', { name: '回到我的作品編輯' }));
  assert.equal(editor.getState().occurrenceId, 'narrative-e9'); assert.equal(editor.getState().playhead, 8.5);
  assert.deepEqual(editor.getState().project, p); assert.equal(editor.getState().past.length, 0);
  assert.ok(screen.getByRole('button', { name: '編輯這次呈現' }));
});

test('refined empty audience uses compact authoring state and rail without an empty graph',()=>{
 desktop();const p=createSample();editor.setState({project:p,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
 fireEvent.click(screen.getByRole('button',{name:'◎ 觀眾體驗 · 情緒／認知／預期'}));
 const before=JSON.stringify(editor.getState().project);
 assert.ok(document.querySelector('.experience-score.is-empty .experience-empty'));
 assert.equal(document.querySelector('.experience-chart'),null);
 assert.equal(document.querySelectorAll('.experience-nodes button').length,p.timelines.audience.placements.length);
 fireEvent.click(screen.getByRole('button',{name:'填寫這一步的情緒'}));
 assert.equal(document.activeElement,screen.getByRole('spinbutton',{name:'好奇 intensity'}));
 assert.equal(JSON.stringify(editor.getState().project),before);
});

test('structure icons distinguish all five levels with full names and no initial-letter badges',()=>{
 desktop();editor.setState({outlineOpen:true,inspectorOpen:false});render(<App/>);
 const structure=screen.getByLabelText('Story structure');
 assert.equal(structure.querySelectorAll('.kind-letter').length,0);
 for(const [kind,name] of [['story','故事'],['act','幕'],['sequence','段落'],['scene','場'],['beat','事件']]) {
  const icon=structure.querySelector(`.structure-legend .kind-${kind}`)!;
  assert.equal(icon.getAttribute('aria-label'),name);assert.ok(icon.querySelector('svg'));
 }
 assert.ok(structure.querySelector('.tree-title .kind-icon'));
});

test('workspace controls are inside their own bounded center widget and panel tabs are local',()=>{
 desktop();editor.setState({project:createTimelineDemo(),outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
 const center=document.querySelector('[data-widget="central-workspace"]')!;
 assert.ok(center.contains(document.querySelector('[data-control-region="comparison-canvas"]')));
 assert.ok(center.contains(screen.getByRole('region',{name:'Aligned narrative timelines'})));
 assert.ok(!center.contains(screen.getByRole('navigation',{name:'工作模式'})));
 const before=JSON.stringify(editor.getState().project);
 fireEvent.click(screen.getByRole('button',{name:'Edit selected event'}));
 const inspector=document.querySelector('[data-widget="selection-inspector"]')!;
 assert.ok(inspector.contains(document.querySelector('[data-control-region="inspector"]')));
 assert.ok(screen.getByLabelText('Selected editing context').textContent!.includes(editor.getState().project.units.find(u=>u.id===editor.getState().selectedId)!.title));
 fireEvent.click(screen.getByRole('button',{name:'Time'}));
 assert.ok(screen.getByRole('region',{name:'Aligned narrative timelines'}));
 assert.equal(JSON.stringify(editor.getState().project),before);
});

test('tool menu distinguishes view switching from opening a sidebar without changing the view',()=>{
 desktop();editor.setState({outlineOpen:false,inspectorOpen:false});renderBase(<App/>);
 assert.ok(document.querySelector('[data-tool-scope="workspace"]')!.contains(screen.getByRole('button',{name:'Single timeline editor'})));
 assert.ok(document.querySelector('[data-tool-scope="sidebar"]')!.contains(screen.getByRole('button',{name:'Edit narrative lines'})));
 const before=JSON.stringify(editor.getState().project);
 fireEvent.click(screen.getByRole('button',{name:'Edit narrative lines'}));
 assert.ok(screen.getByRole('region',{name:'Story reading workspace'}));
 assert.ok(screen.getByRole('heading',{name:'故事線管理'}));
 assert.equal(JSON.stringify(editor.getState().project),before);
});

test('3D continuous pointer and keyboard orbit pass previous clamp and preserve exact selection',()=>{
 desktop();editor.setState({project:createTimelineDemo(),selectedId:'e9',basis:'narrative',occurrenceId:'narrative-e9',zoom:87,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
 fireEvent.click(screen.getByRole('button',{name:'Timeline workbench'}));openSpatial();
 const svg=document.querySelector('.holo-surface svg')!;
 const before=JSON.stringify(editor.getState().project),selected=editor.getState().occurrenceId;
 pointer(svg,'pointerdown',100,200);pointer(svg,'pointermove',800,800);pointer(svg,'pointerup',800,800);
 const surface=document.querySelector('.holo-surface')!;
 const yaw=Number(surface.getAttribute('data-camera-yaw'));
 assert.ok(Math.abs(yaw)>1.15);
 assert.ok(Number(surface.getAttribute('data-camera-pitch'))<-.1);
 fireEvent.keyDown(svg,{key:'ArrowRight'});assert.notEqual(Number(surface.getAttribute('data-camera-yaw')),yaw);
 assert.equal(document.querySelectorAll('.holo-node[data-selection-kind="active"]').length,1);
 assert.ok(document.querySelectorAll('.holo-node[data-selection-kind="corresponding"]').length>=2);
 assert.equal(editor.getState().occurrenceId,selected);assert.equal(JSON.stringify(editor.getState().project),before);
 openCamera();fireEvent.click(screen.getByRole('button',{name:'Reset view'}));assert.equal(Number(surface.getAttribute('data-camera-yaw')),-.22);
});

function openNavigator() {
  fireEvent.click(screen.getByRole('button', { name: 'Timeline workbench' }));
}
function overviewNode(id: string) { return document.querySelector<HTMLButtonElement>(`[data-overview-occurrence="${id}"]`)!; }
test('three-row overview opens without choosing a focus line; hover previews and leave restores without edits', () => {
  desktop(); editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  assert.equal(document.querySelectorAll('.overview-lane').length,3);assert.equal(screen.queryByRole('region',{name:'單線閱讀細節'}),null);
  const before=JSON.stringify(editor.getState()), current=document.querySelector('.reference-current')!.textContent;
  fireEvent.pointerEnter(overviewNode('audience-disclosure-3'));
  assert.equal(document.querySelector('[aria-label="三線總覽與播放"]')!.getAttribute('data-previewing'),'true');
  assert.match(document.querySelector('.reference-current')!.textContent!,/暫看/);
  assert.ok(document.querySelectorAll('.overview-rail .is-dimmed').length>0);
  assert.equal(JSON.stringify(editor.getState()),before);
  fireEvent.pointerLeave(document.querySelector('.overview-lanes')!);
  assert.equal(document.querySelector('.reference-current')!.textContent,current);assert.equal(JSON.stringify(editor.getState()),before);
});
test('hovering along a row previews nearest position with no click or global selection', () => {
  desktop();editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  const rail=screen.getByRole('group',{name:'观眾理解事件軌'.replace('观','觀')});
  rail.getBoundingClientRect=()=>({left:0,width:700,right:700,top:0,bottom:44,height:44,x:0,y:0,toJSON:()=>{}});
  const move=new window.MouseEvent('pointermove',{clientX:350,clientY:10,bubbles:true});Object.defineProperty(move,'pointerType',{value:'mouse'});fireEvent(rail,move);
  assert.match(document.querySelector('.reference-current')!.textContent!,/理解順序第 4 步/);
  assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().past.length,0);
});
test('click chooses exact repeated audience node, real detail contains authored curves, Back restores cursor and focus', () => {
  desktop();editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  const before=JSON.stringify(editor.getState().project);fireEvent.change(screen.getByLabelText('呈現步序'),{target:{value:'5'}});
  const button=overviewNode('audience-disclosure-3');fireEvent.click(button);
  assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');assert.ok(screen.getByRole('region',{name:'單線閱讀細節'}));
  assert.equal(document.querySelector('[data-focus-basis]')!.getAttribute('data-focus-basis'),'audience');
  assert.equal(document.querySelectorAll('[data-focus-emotion-segment]').length,21);
  assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(document.querySelector('[data-focus-occurrence="audience-disclosure-0"]')!);
  assert.equal(editor.getState().occurrenceId,'audience-disclosure-0');
  fireEvent.click(screen.getByRole('button',{name:'← 回到三線總覽'}));
  assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().playhead,.5);
  assert.equal((screen.getByLabelText('呈現步序') as HTMLInputElement).value,'5');
  assert.equal(document.querySelector('[aria-label="三線總覽與播放"]')!.getAttribute('data-previewing'),'false');
  assert.equal(document.activeElement?.getAttribute('data-overview-occurrence'),button.getAttribute('data-overview-occurrence'));assert.equal(JSON.stringify(editor.getState().project),before);assert.equal(editor.getState().past.length,0);
});
test('reality and presentation detail never fabricate emotional curves; missing mappings stay unknown', () => {
  const p=createTimelineDemo();p.timelines.reality.placements=p.timelines.reality.placements.filter(o=>o.eventId!=='e9');
  editor.setState({project:p,basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  assert.match(document.querySelector('[data-overview-basis="reality"]')!.textContent!,/人物狀態未知/);
  fireEvent.click(overviewNode('narrative-opening'));assert.equal(document.querySelectorAll('[data-focus-emotion]').length,0);
  assert.match(screen.getByRole('region',{name:'單線閱讀細節'}).textContent!,/尚無情緒數值模型/);
  fireEvent.keyDown(screen.getByRole('region',{name:'單線閱讀細節'}),{key:'Escape'});
  assert.equal(screen.queryByRole('region',{name:'單線閱讀細節'}),null);
});
test('keyboard previews nodes and Enter enters same line, Escape restores overview', () => {
  editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  const start=overviewNode('reality-e1');act(()=>start.focus());fireEvent.keyDown(start,{key:'ArrowRight'});
  assert.equal(document.activeElement?.getAttribute('data-overview-occurrence'),'reality-e2');assert.match(document.querySelector('.reference-current')!.textContent!,/世界順序第 2 步/);
  fireEvent.click(document.activeElement!);assert.equal(editor.getState().basis,'reality');assert.equal(editor.getState().occurrenceId,'reality-e2');
  fireEvent.keyDown(screen.getByRole('region',{name:'單線閱讀細節'}),{key:'Escape'});assert.equal(editor.getState().occurrenceId,'narrative-opening');
});
test('playback advances exact narrative steps, pauses on preview, resumes on leave and cancels on scrub', () => {
  editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  const originalSet=window.setTimeout,originalClear=window.clearTimeout;
  let callback:(()=>void)|undefined,clears=0;
  window.setTimeout=((fn:()=>void)=>{callback=fn;return 123;}) as typeof window.setTimeout;window.clearTimeout=()=>{clears++;callback=undefined;};
  try{
    fireEvent.click(screen.getByRole('button',{name:'播放呈現步序'}));assert.ok(callback);
    act(()=>callback!());assert.equal((screen.getByLabelText('呈現步序') as HTMLInputElement).value,'1');
    fireEvent.pointerEnter(overviewNode('reality-e8'));assert.equal(callback,undefined);assert.ok(clears>0);
    fireEvent.pointerLeave(document.querySelector('.overview-lanes')!);assert.ok(callback);
    fireEvent.change(screen.getByLabelText('呈現步序'),{target:{value:'10'}});assert.equal(callback,undefined);assert.ok(screen.getByRole('button',{name:'播放呈現步序'}));
    const audience=document.querySelector('.overview-audience-state')!;assert.match(audience.textContent!,/呈現順序第 11 步/);
    fireEvent.change(screen.getByLabelText('呈現步序'),{target:{value:'0'}});assert.match(audience.textContent!,/開場設定/);
    assert.equal(editor.getState().occurrenceId,'narrative-opening');assert.equal(editor.getState().past.length,0);
  }finally{window.setTimeout=originalSet;window.clearTimeout=originalClear;}
});
test('phone tap and scrub perform complete focus/back flow without hover, navigation remains scoped', () => {
  phone();editor.setState({project:createTimelineDemo(),basis:'audience',occurrenceId:'audience-disclosure-3',selectedId:'e1',playhead:3.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  assert.equal(document.querySelector('.workspace-tool-menu'),null);assert.equal(screen.queryByText('更多工具'),null);
  const workspace=document.querySelector('[data-widget="central-workspace"]')!;
  assert.ok(workspace.contains(screen.getByRole('button',{name:'Edit narrative lines'})));
  assert.ok(screen.getByRole('navigation',{name:'工作模式'}).contains(screen.getByRole('button',{name:'Timeline workbench'})));
  fireEvent.change(screen.getByLabelText('呈現步序'),{target:{value:'3'}});fireEvent.click(overviewNode('reality-e4'));
  assert.equal(editor.getState().basis,'reality');fireEvent.click(screen.getByRole('button',{name:'← 回到三線總覽'}));
  assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');assert.equal((screen.getByLabelText('呈現步序') as HTMLInputElement).value,'3');desktop();
});

test('exact repeated reference can enter its own line and Audience preview honors modern explicit blanks', () => {
  const p=createTimelineDemo();p.timelines.audience.placements[3].audienceDesign!.cognition={knows:'',believes:'MODERN EXACT BELIEF',questions:''};
  editor.setState({project:p,basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  assert.equal((screen.getByRole('button',{name:'進入觀眾看到'}) as HTMLButtonElement).disabled,false);
  fireEvent.pointerEnter(overviewNode('audience-disclosure-3'));
  const preview=document.querySelector('[data-cognition-source="exact-design"]')!;
  assert.match(preview.textContent!,/MODERN EXACT BELIEF/);assert.match(preview.textContent!,/知道：尚未寫下/);
  assert.equal((screen.getByRole('button',{name:'進入觀眾理解'}) as HTMLButtonElement).disabled,false);
  fireEvent.click(screen.getByRole('button',{name:'進入觀眾理解'}));assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');
});
test('focus follows reorder and Back does not restore a deleted occurrence', async () => {
  const {moveOccurrences,removeOccurrence}=await import('./temporal');
  editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  fireEvent.click(overviewNode('narrative-e10'));
  act(()=>editor.getState().transact(p=>moveOccurrences(p,'narrative',['narrative-e10'],'narrative-e2')));
  let state=editor.getState();assert.equal(state.playhead,state.project.timelines.narrative.placements.findIndex(o=>o.id==='narrative-e10')+.5);
  act(()=>editor.getState().transact(p=>removeOccurrence(p,'narrative','narrative-opening')));
  fireEvent.click(screen.getByRole('button',{name:'← 回到三線總覽'}));
  assert.notEqual(editor.getState().occurrenceId,'narrative-opening');assert.match(document.querySelector('.navigator-overview')!.textContent!,/原本的選取位置已變更/);
});
test('Back reattaches an existing original occurrence after reorder while keeping data edits', async () => {
  const {moveOccurrences}=await import('./temporal');
  editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-e1',selectedId:'e1',playhead:1.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  fireEvent.click(overviewNode('audience-disclosure-3'));
  act(()=>editor.getState().transact(p=>moveOccurrences(p,'narrative',['narrative-e1'],'narrative-e6')));
  const index=editor.getState().project.timelines.narrative.placements.findIndex(o=>o.id==='narrative-e1');
  fireEvent.click(screen.getByRole('button',{name:'← 回到三線總覽'}));assert.equal(editor.getState().occurrenceId,'narrative-e1');assert.equal(editor.getState().playhead,index+.5);assert.equal(editor.getState().past.length,1);
});
test('expanded spatial projection gets exact playback markers without moving editing selection', () => {
  editor.setState({project:createTimelineDemo(),basis:'audience',occurrenceId:'audience-disclosure-3',selectedId:'e1',playhead:3.5,zoom:87,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  assert.ok(screen.getByLabelText('Semantic zoom level').closest('[hidden]'));openSpatial();assert.ok(!screen.getByLabelText('Semantic zoom level').closest('[hidden]'));
  assert.equal(document.querySelector('[data-playback-kind="reference"]')!.getAttribute('data-playback-occurrence'),'narrative-opening');
  fireEvent.change(screen.getByLabelText('呈現步序'),{target:{value:'9'}});
  assert.equal(document.querySelector('[data-playback-kind="reference"]')!.getAttribute('data-playback-occurrence'),'narrative-e9');
  assert.equal(document.querySelectorAll('[data-playback-kind="reference"]').length,1);assert.equal(editor.getState().occurrenceId,'audience-disclosure-3');
});
test('deleting the playback reference pauses and shows explicit stale cursor rather than selecting another event', async () => {
  const {removeOccurrence}=await import('./temporal');editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderBase(<App/>);openNavigator();
  fireEvent.click(screen.getByRole('button',{name:'播放呈現步序'}));act(()=>editor.getState().transact(p=>removeOccurrence(p,'narrative','narrative-opening')));
  assert.ok(screen.getByRole('button',{name:'播放呈現步序'}));assert.match(document.querySelector('.reference-current')!.textContent!,/請選擇呈現步序/);assert.match(document.querySelector('.navigator-overview')!.textContent!,/播放節點已移除/);
});
test('lower categorical tracks retain state and carry-forward text with explicit visible style rules', async () => {
  const {readFileSync}=await import('node:fs');
  const base=readFileSync(new URL('style.css',import.meta.url),'utf8'), final=readFileSync(new URL('timelineNavigator.css',import.meta.url),'utf8');
  assert.doesNotMatch(base,/\.arc-card>p,\.arc-kicker,\.arc-card>strong/);
  assert.match(final,/\.arc-card>strong\s*\{\s*display:block/);
  assert.match(final,/\.arc-card>\.arc-kicker\s*\{\s*display:block/);
  desktop();editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-e1',selectedId:'e1',zoom:87,outlineOpen:false,inspectorOpen:false});render(<App/>);
  for(const id of ['lin','ze','audience']) {
    const row=document.querySelector(`[data-track-id="${id}"]`)!;
    const card=row.querySelector('[data-state-unit="narrative-e1"]')!;
    assert.ok(card.querySelector('strong')!.textContent!.trim());assert.ok(card.querySelector('.arc-kicker')!.textContent!.trim());assert.ok(row.querySelector('.track-label>small')!.textContent!.trim());
  }
  const carried=document.querySelector('[data-track-id="lin"] [data-state-unit="narrative-e1"]')!;assert.match(carried.textContent!,/沿用前一次已寫狀態/);assert.equal(carried.getAttribute('data-has-state-change'),'false');
});
test('outline disclosure has stable SVG cell and explicit expansion state without selecting or editing', () => {
  desktop();editor.setState({project:createTimelineDemo(),outlineOpen:true,inspectorOpen:false});render(<App/>);
  const outline=screen.getByLabelText('Story structure'),toggle=outline.querySelector<HTMLButtonElement>('.twisty')!,before=JSON.stringify(editor.getState().project),row=toggle.parentElement!;
  const padding=row.style.paddingLeft;assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.ok(toggle.querySelector('svg'));
  fireEvent.click(toggle);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(row.style.paddingLeft,padding);assert.ok(toggle.querySelector('svg'));
  fireEvent.click(toggle);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(JSON.stringify(editor.getState().project),before);
});
test('noncontiguous repeated containers are labeled as separate segments without merging their occurrences', async () => {
  const {moveOccurrences,axisView}=await import('./temporal');const p=createTimelineDemo();moveOccurrences(p,'narrative',['narrative-e1'],'narrative-e13');
  editor.setState({project:p,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  const bands=document.querySelectorAll('[data-basis="narrative"] [data-container-id="a1"]');
  assert.ok(axisView(p,'narrative').units.filter(u=>u.kind==='act'&&u.canonicalId==='a1').length>1);
  assert.ok(document.querySelectorAll('.container-segment-label').length>=2);assert.ok(Array.from(document.querySelectorAll('.container-segment-label')).some(el=>el.textContent==='第 2/2 段'));
  assert.equal(JSON.stringify(editor.getState().project),JSON.stringify(p));
});
test('presentation structure is shown on Narrative while Reality and Audience retain separate optional affiliation', () => {
  editor.setState({project:createTimelineDemo(),basis:'narrative',occurrenceId:'narrative-opening',selectedId:'e9',playhead:.5,outlineOpen:false,inspectorOpen:false});renderRaw(<App/>);
  assert.equal(document.querySelectorAll('[data-basis="reality"] .aligned-container').length,0);
  assert.equal(document.querySelectorAll('[data-basis="audience"] .aligned-container').length,0);
  assert.ok(document.querySelectorAll('[data-basis="narrative"] .aligned-container').length>0);
  fireEvent.click(screen.getByRole('button',{name:'Single timeline editor'}));
  assert.equal((document.querySelector('.editor-structure-context') as HTMLDetailsElement).open,true);
  fireEvent.click(screen.getByRole('button',{name:'Reality 16'}));
  assert.equal((document.querySelector('.editor-structure-context') as HTMLDetailsElement).open,false);
  assert.match(document.querySelector('.editor-structure-context')!.textContent!,/作品結構歸屬/);
});
