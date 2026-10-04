import { test } from "node:test";
import assert from "node:assert/strict";
import { createSample, createTimelineDemo } from "./sample";
import {
  approveStage,
  clone,
  editUnit,
  orderedBeats,
  parseProject,
  removeUnit,
  reviewStage,
  validateProject,
} from "./model";
import {
  addOccurrence,
  axisView,
  bases,
  diagnostics,
  eventMappings,
  moveOccurrences,
  patchOccurrence,
  removeOccurrence,
  setOccurrenceState,
  stateAtBasis,
} from "./temporal";
import { makeStore, readSavedProject, STORAGE_KEY } from "./store";
test("v1 migrates without resetting facts, hierarchy, transitions or approved history", () => {
  const p = createSample();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint");
  const old: any = clone(p);
  old.schemaVersion = 1;
  delete old.timelines;
  const next = parseProject(JSON.stringify(old));
  assert.equal(next.schemaVersion, 2);
  assert.deepEqual(next.units, old.units);
  assert.deepEqual(next.transitions, old.transitions);
  for (const b of bases) assert.equal(next.timelines[b].placements.length, 16);
  assert.notEqual(
    next.timelines.audience.placements[4].updates,
    next.timelines.narrative.placements[4].updates,
  );
});
test("demo has distinct world, presentation and disclosure order with one canonical identity", () => {
  const p = createTimelineDemo();
  validateProject(p);
  assert.deepEqual(
    bases.map((b) => p.timelines[b].placements.length),
    [16, 17, 7],
  );
  assert.equal(p.timelines.reality.placements[0].eventId, "e1");
  assert.equal(p.timelines.narrative.placements[0].eventId, "e9");
  assert.equal(p.timelines.audience.placements[1].eventId, "e5");
  assert.equal(p.units.filter((n) => n.id === "e9").length, 1);
  assert.equal(
    eventMappings(p, "e9").find((x) => x.basis === "narrative")!.items.length,
    2,
  );
});
test("moving Narrative changes no Reality placement or event facts", () => {
  const p = createTimelineDemo(),
    reality = clone(p.timelines.reality),
    fact = clone(p.units.find((n) => n.id === "e1")!);
  moveOccurrences(p, "narrative", ["narrative-e1"], "narrative-e10");
  assert.deepEqual(p.timelines.reality, reality);
  const changed = p.units.find((n) => n.id === "e1")!;
  assert.equal(changed.summary, fact.summary);
  assert.equal(changed.parentId, fact.parentId);
  assert.equal(
    p.timelines.narrative.placements.findIndex((x) => x.id === "narrative-e1"),
    10,
  );
});
test("repeated occurrences have independent notes and disclosure snapshots", () => {
  const p = createTimelineDemo();
  const id = addOccurrence(p, "audience", "e1");
  const original = clone(p.timelines.audience.placements[0]);
  patchOccurrence(p, "audience", id, {
    knowledgeNote: "New interpretation",
    mode: "repeat",
  });
  assert.deepEqual(p.timelines.audience.placements[0], original);
  assert.throws(() => addOccurrence(p, "reality", "e1"), /once/);
  removeOccurrence(p, "audience", id);
  assert.ok(p.units.some((n) => n.id === "e1"));
});
test("canonical edits propagate across every occurrence without duplicating history", () => {
  const p = createTimelineDemo();
  editUnit(p, "e9", { title: "Changed canonical fact" });
  const view = axisView(p, "narrative");
  assert.equal(
    view.units.filter((n) => n.canonicalId === "e9" && n.kind === "beat")
      .length,
    2,
  );
  assert.ok(
    view.units
      .filter((n) => n.canonicalId === "e9")
      .every((n) => n.title === "Changed canonical fact"),
  );
});
test("audience cannot inherit character-private knowledge or future disclosure", () => {
  const p = createTimelineDemo();
  assert.equal(stateAtBasis(p, "ze", 0, "audience").snapshot.knowledge, "");
  assert.equal(
    stateAtBasis(p, "audience", 16, "reality").snapshot.state,
    "No audience clock",
  );
  assert.equal(
    stateAtBasis(p, "audience", 1.49, "audience").snapshot.state,
    "好奇",
  );
  assert.equal(
    stateAtBasis(p, "audience", 1.5, "audience").snapshot.state,
    "誤判",
  );
  assert.equal(
    stateAtBasis(p, "audience", 2.49, "audience").snapshot.state,
    "誤判",
  );
  assert.equal(
    stateAtBasis(p, "audience", 2.5, "audience").snapshot.state,
    "恍然",
  );
  assert.equal(
    stateAtBasis(p, "audience", 3.5, "audience").snapshot.state,
    "重讀",
  );
});
test("Narrative flashback revisits character state at Reality anchor", () => {
  const p = createTimelineDemo();
  assert.equal(stateAtBasis(p, "lin", 0.5, "narrative").snapshot.state, "控制");
  assert.equal(stateAtBasis(p, "lin", 1.5, "narrative").snapshot.state, "信任");
  assert.equal(
    stateAtBasis(p, "audience", 0.5, "narrative").snapshot.state,
    "好奇",
  );
});
test("audience can explicitly model a character belief independently of true belief", () => {
  const p = createTimelineDemo(),
    item = p.timelines.audience.placements[0];
  setOccurrenceState(p, "audience", item.id, {
    trackId: "ze",
    interpretation: "We suspect he is guilty",
    reaction: "Watch for evidence",
    after: {
      state: "Suspected",
      knowledge: "Unknown to audience",
      goal: "Unknown",
      obstacle: "Unknown",
      motivation: "Unknown",
    },
  });
  assert.equal(
    stateAtBasis(p, "ze", 0.5, "audience").snapshot.state,
    "Suspected",
  );
  assert.equal(stateAtBasis(p, "ze", 0.5, "reality").snapshot.state, "秘密求援");
});
test("semantic groups can recur without swallowing intervening containers", () => {
  const p = createTimelineDemo();
  const id = addOccurrence(p, "narrative", "e1");
  patchOccurrence(p, "narrative", id, { containerId: "s1" });
  const view = axisView(p, "narrative");
  assert.equal(
    view.units.filter((n) => n.canonicalId === "a1" && n.kind === "act").length,
    2,
  );
  for (const n of view.units.filter((n) => n.kind === "beat")) {
    const r = view.ranges.get(n.id)!,
      parent = view.ranges.get(n.parentId!)!;
    assert.ok(r.start >= parent.start && r.end <= parent.end);
  }
});
test("mapping diagnostics flag explicit label conflicts and missing anchors, not story quality", () => {
  const p = createTimelineDemo();
  patchOccurrence(p, "narrative", "narrative-e16", { mode: "flashback" });
  assert.ok(
    diagnostics(p).some(
      (x) => x.occurrenceId === "narrative-e16" && x.kind === "check",
    ),
  );
  removeOccurrence(p, "reality", "reality-e9");
  assert.ok(
    diagnostics(p).some(
      (x) => x.occurrenceId === "narrative-opening" && x.kind === "gap",
    ),
  );
  assert.equal(
    stateAtBasis(p, "lin", 0.5, "narrative").snapshot.state,
    "Unmapped in Reality",
  );
});
test("v2 rejects orphan links, duplicate occurrence ids and duplicated Reality events", () => {
  for (const mutate of [
    (p: any) => (p.timelines.narrative.placements[0].eventId = "missing"),
    (p: any) => (p.timelines.narrative.placements[0].containerId = "missing"),
    (p: any) =>
      (p.timelines.audience.placements[0].id =
        p.timelines.narrative.placements[0].id),
    (p: any) => (p.timelines.reality.placements[0].eventId = "e2"),
  ]) {
    const p = createTimelineDemo();
    mutate(p);
    assert.throws(() => validateProject(p));
  }
});
test("timeline edits and approval linkage survive roundtrip and undo redo", () => {
  const p = createTimelineDemo();
  reviewStage(p, "e9", "director");
  approveStage(p, "e9", "director");
  const snapshot = clone(
    p.units.find((n) => n.id === "e9")!.stages.director.approvals[0],
  );
  const s = makeStore(p);
  s.getState().transact((p) =>
    moveOccurrences(p, "narrative", ["narrative-opening"], "narrative-e16"),
  );
  const changed = clone(s.getState().project);
  assert.deepEqual(
    changed.units.find((n) => n.id === "e9")!.stages.director.approvals[0],
    snapshot,
  );
  assert.notEqual(
    changed.units.find((n) => n.id === "e9")!.stages.blueprint.revision,
    changed.units.find((n) => n.id === "e9")!.stages.director.blueprintRevision,
  );
  assert.deepEqual(parseProject(JSON.stringify(changed)), changed);
  s.getState().undo();
  assert.deepEqual(s.getState().project, p);
  s.getState().redo();
  assert.deepEqual(s.getState().project, changed);
});
test("deleting canonical event removes every occurrence and keeps all timelines valid", () => {
  const p = createTimelineDemo();
  removeUnit(p, "e9");
  validateProject(p);
  for (const b of bases)
    assert.ok(!p.timelines[b].placements.some((x) => x.eventId === "e9"));
});

test("reading a saved v1 story migrates in memory without modifying the stored original", () => {
  const original: any = clone(createSample());
  original.schemaVersion = 1;
  delete original.timelines;
  original.title = "My untouched work";
  const raw = JSON.stringify(original);
  const storage = {
    getItem: (key: string) => (key === STORAGE_KEY ? raw : null),
  };
  const result = readSavedProject(storage);
  assert.equal(result.project.title, "My untouched work");
  assert.equal(result.project.schemaVersion, 2);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.match(result.notice, /preserved/);
});
test("invalid saved JSON reports recovery and is never overwritten by read", () => {
  const storage = { getItem: () => "{broken" };
  const result = readSavedProject(storage);
  assert.match(result.notice, /untouched/);
  assert.equal(storage.getItem(), "{broken");
});
test("maximum-length legacy event identifiers migrate to valid occurrence ids", () => {
  const old: any = clone(createSample());
  old.schemaVersion = 1;
  delete old.timelines;
  const long = "x".repeat(100);
  old.units.find((n: any) => n.id === "e1").id = long;
  old.transitions.forEach((t: any) => { if (t.eventId === "e1") t.eventId = long; });
  const migrated = parseProject(JSON.stringify(old));
  validateProject(migrated);
  assert.ok(
    migrated.timelines.reality.placements.some((x) => x.eventId === long),
  );
});

test("moving one canonical unit does not normalize unrelated intentional flashbacks", async () => {
  const { reorderUnit } = await import("./model");
  const p = createTimelineDemo();
  const opening = clone(p.timelines.narrative.placements[0]);
  reorderUnit(p, "e15", "e16");
  assert.deepEqual(p.timelines.narrative.placements[0], opening);
  assert.equal(p.timelines.reality.placements[0].eventId, "e1");
  assert.equal(p.timelines.narrative.placements.at(-1)!.eventId, "e15");
});

test("legal occurrence ids cannot collide with internal semantic container ids", () => {
  const p = createSample();
  p.timelines.narrative.placements[0].id = "story";
  p.timelines.narrative.placements[1].id = "view-narrative-0-0";
  validateProject(p);
  const view = axisView(p, "narrative");
  assert.equal(new Set(view.units.map((n) => n.id)).size, view.units.length);
  assert.equal(view.ranges.get("~story")!.end, 16);
});
