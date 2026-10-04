import { test } from "node:test";
import assert from "node:assert/strict";
import { createSample } from "./sample";
import {
  addUnit,
  approveStage,
  children,
  createBlankProject,
  clone,
  descendants,
  editStage,
  editUnit,
  orderedBeats,
  parseProject,
  ranges,
  rebaseStage,
  removeUnit,
  reorderUnit,
  reviewStage,
  scaleAt,
  setTransition,
  stateAt,
  trackRange,
  validateProject,
  visibleUnits,
} from "./model";
import { makeStore } from "./store";
test("sample hierarchy is valid and semantic levels are actual distinct entities", () => {
  const p = createSample();
  validateProject(p);
  assert.equal(orderedBeats(p).length, 16);
  assert.deepEqual([0, 25, 50, 75, 100].map(scaleAt), [
    "Story",
    "Sequences",
    "Scenes",
    "Beats",
    "Beats",
  ]);
  assert.deepEqual(
    [0, 25, 50, 75].map((z) => visibleUnits(p, z).length),
    [3, 4, 8, 16],
  );
  assert.equal(
    new Set([0, 25, 50, 75].flatMap((z) => visibleUnits(p, z).map((n) => n.id)))
      .size,
    31,
  );
});
test("containers cover complete children; each beat has one ancestry", () => {
  const p = createSample(),
    rr = ranges(p);
  assert.deepEqual(rr.get("a1"), { start: 0, end: 8 });
  assert.deepEqual(rr.get("a2"), { start: 8, end: 12 });
  assert.deepEqual(rr.get("story"), { start: 0, end: 16 });
  for (const n of p.units.filter((n) => n.kind !== "story")) {
    const range = rr.get(n.id)!,
      parent = rr.get(n.parentId!)!;
    assert.ok(range.start >= parent.start && range.end <= parent.end);
  }
});
test("cursor state uses exact boundary, initial values, and carries across acts", () => {
  const p = createSample();
  assert.equal(stateAt(p, "lin", 0).eventId, null);
  assert.equal(stateAt(p, "lin", 2.49).snapshot.state, "信任");
  assert.equal(stateAt(p, "lin", 2.5).snapshot.state, "懷疑");
  assert.equal(stateAt(p, "lin", 8).snapshot.state, "控制");
  assert.equal(stateAt(p, "audience", 9.49).snapshot.state, "誤判");
  assert.equal(stateAt(p, "audience", 9.5).snapshot.state, "恍然");
  assert.equal(stateAt(p, "lin", 16).snapshot.state, "有界線的信任");
});
test("shared event has different interpretations without duplicate objective entities", () => {
  const p = createSample();
  assert.equal(p.units.filter((n) => n.id === "e10").length, 1);
  const links = p.transitions.filter((t) => t.eventId === "e10");
  assert.equal(links.length, 2);
  assert.notEqual(links[0].interpretation, links[1].interpretation);
  assert.equal(trackRange(p, "lin", ranges(p).get("a1")!).after.state, "控制");
});
test("moving whole acts preserves nested descendants and all shared links", () => {
  const p = createSample(),
    ids = descendants(p, "a1").map((n) => n.id),
    links = clone(p.transitions);
  reorderUnit(p, "a1", "a3");
  validateProject(p);
  assert.deepEqual(
    descendants(p, "a1").map((n) => n.id),
    ids,
  );
  assert.deepEqual(p.transitions, links);
  assert.equal(orderedBeats(p).at(-1)!.id, "e8");
  assert.equal(stateAt(p, "lin", 16).snapshot.state, "控制");
  assert.ok(p.units.every((n) => n.stages.blueprint.revision === 2));
});
test("reparenting like units preserves hierarchy and refuses empty branches", () => {
  const p = createSample();
  reorderUnit(p, "e1", "e4");
  validateProject(p);
  assert.equal(p.units.find((n) => n.id === "e1")!.parentId, "s2");
  assert.throws(() => reorderUnit(p, "e2", "e4"), /Keep at least/);
  const previous = JSON.stringify(p);
  reorderUnit(p, "a1", "e4");
  assert.equal(JSON.stringify(p), previous);
});
test("new subtree and deletion maintain valid hierarchy and remove orphan links", () => {
  const p = createSample();
  const id = addUnit(p, "story")!;
  validateProject(p);
  assert.equal(descendants(p, id).length, 3);
  removeUnit(p, id);
  validateProject(p);
  removeUnit(p, "e10");
  assert.ok(!p.transitions.some((t) => t.eventId === "e10"));
  validateProject(p);
  assert.throws(() => removeUnit(p, "e9"), /Keep one/);
  removeUnit(p, "s5");
  validateProject(p);
});
test("editing blueprint flags dependent realization without touching approved snapshots", () => {
  const p = createSample(),
    n = p.units.find((n) => n.id === "e10")!;
  reviewStage(p, n.id, "blueprint");
  approveStage(p, n.id, "blueprint", "2026-10-01T00:00:00Z");
  reviewStage(p, n.id, "actor");
  approveStage(p, n.id, "actor");
  const snapshot = clone(n.stages.blueprint.approvals[0]),
    actor = clone(n.stages.actor.approvals[0]);
  editUnit(p, n.id, { intent: "New intent" });
  assert.equal(n.stages.blueprint.status, "draft");
  assert.equal(n.stages.actor.status, "approved");
  assert.notEqual(
    n.stages.actor.blueprintRevision,
    n.stages.blueprint.revision,
  );
  assert.deepEqual(n.stages.blueprint.approvals[0], snapshot);
  assert.deepEqual(n.stages.actor.approvals[0], actor);
  assert.throws(() => reviewStage(p, n.id, "actor"), /Link this/);
  rebaseStage(p, n.id, "actor");
  editStage(p, n.id, "actor", "A revised action");
  reviewStage(p, n.id, "actor");
  approveStage(p, n.id, "actor");
  assert.equal(n.stages.actor.approvals.length, 2);
  assert.equal(n.stages.actor.approvals[1].blueprintRevision, 2);
});
test("approval requires review and event state edits reopen blueprint", () => {
  const p = createSample();
  assert.throws(() => approveStage(p, "e10", "director"), /Request review/);
  const transition = clone(p.transitions.find((t) => t.eventId === "e10")!);
  transition.after.goal = "Different goal";
  setTransition(p, transition);
  assert.equal(
    p.units.find((n) => n.id === "e10")!.stages.blueprint.revision,
    2,
  );
});
test("undo redo preserve project, event links, and approval history atomically", () => {
  const s = makeStore();
  const initial = clone(s.getState().project);
  s.getState().transact((p) => {
    editUnit(p, "e1", { title: "Changed" });
    reviewStage(p, "e1", "blueprint");
    approveStage(p, "e1", "blueprint");
  });
  const changed = clone(s.getState().project);
  s.getState().undo();
  assert.deepEqual(s.getState().project, initial);
  s.getState().redo();
  assert.deepEqual(s.getState().project, changed);
  s.getState().undo();
  s.getState().transact((p) => editUnit(p, "e2", { title: "Different edit" }));
  assert.equal(s.getState().future.length, 0);
});
test("failed transactions and malformed imports leave project unchanged", () => {
  const s = makeStore(),
    initial = JSON.stringify(s.getState().project);
  s.getState().transact((p) => {
    p.units[0].parentId = "e1";
  });
  assert.equal(JSON.stringify(s.getState().project), initial);
  assert.match(s.getState().notice, /Invalid project/);
  for (const mutate of [
    (p: any) => (p.schemaVersion = 3),
    (p: any) => (p.units[1].id = p.units[0].id),
    (p: any) => (p.units[1].parentId = "e1"),
    (p: any) => (p.transitions[0].eventId = "missing"),
    (p: any) => p.transitions.push(p.transitions[0]),
    (p: any) => (p.tracks[0].initial.state = 42),
    (p: any) => (p.tracks[0].id = "__proto__"),
  ]) {
    const p = createSample();
    mutate(p);
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
});
test("JSON roundtrip validates structure, links, local save and import undo", () => {
  const p = createSample();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint");
  const result = parseProject(JSON.stringify(p));
  assert.deepEqual(result, p);
  const s = makeStore();
  s.getState().importProject(result);
  assert.deepEqual(s.getState().project, result);
  s.getState().undo();
  assert.deepEqual(s.getState().project, createSample());
});
test("bad approval JSON is rejected before the inspector can parse it", () => {
  const p = createSample();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint");
  p.units.find((n) => n.id === "e1")!.stages.blueprint.approvals[0].snapshot =
    "bad";
  assert.throws(() => validateProject(p), /snapshot must be valid JSON/);
});

test("blueprint context changes invalidate ancestors and child realizations", () => {
  const p = createSample();
  const act = p.units.find((n) => n.id === "a2")!;
  reviewStage(p, act.id, "blueprint");
  approveStage(p, act.id, "blueprint");
  const approved = clone(act.stages.blueprint.approvals[0]);
  editUnit(p, "e10", { summary: "Changed evidence" });
  assert.equal(act.stages.blueprint.status, "draft");
  assert.deepEqual(act.stages.blueprint.approvals[0], approved);
  const scene = p.units.find((n) => n.id === "s5")!;
  const before = p.units.find((n) => n.id === "e9")!.stages.blueprint.revision;
  editStage(p, scene.id, "blueprint", "Revised scene intention");
  assert.ok(
    p.units.find((n) => n.id === "e9")!.stages.blueprint.revision > before,
  );
});
test("independent sample projects never share mutable initial snapshots", () => {
  const one = createSample(),
    two = createSample();
  one.tracks[0].initial.state = "changed";
  assert.equal(two.tracks[0].initial.state, "信任");
});

test("a blank story has a valid minimal hierarchy and no sample data", () => {
  const p = createBlankProject();
  validateProject(p);
  assert.equal(p.units.length, 5);
  assert.equal(orderedBeats(p).length, 1);
  assert.equal(p.tracks.length, 0);
  assert.equal(p.transitions.length, 0);
});
