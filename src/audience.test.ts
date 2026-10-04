import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimelineDemo, createSample } from "./sample";
import {
  parseProject,
  validateProject,
  approveStage,
  reviewStage,
} from "./model";
import { makeStore, readSavedProject } from "./store";
import { emptyAudienceDesign, emotionCurveSeries } from "./audience";
import { patchOccurrence, removeOccurrence, moveOccurrences } from "./temporal";
test("emotion curves distinguish old empty stories from the authored demonstration without filling data", () => {
  const p = createSample(), before = JSON.stringify(p);
  const empty = emotionCurveSeries(p.timelines.audience.placements);
  assert.ok(empty.every(s => s.points.length === 0 && s.segments.length === 0));
  assert.equal(JSON.stringify(p), before);
  const demo = emotionCurveSeries(createTimelineDemo().timelines.audience.placements);
  assert.equal(demo.reduce((n, s) => n + s.segments.length, 0), 21);
  assert.equal(demo.find(s => s.emotion === 'sadness')!.points.length, 1);
  assert.equal(demo.find(s => s.emotion === 'sadness')!.segments.length, 0);
});
test("emotion curves retain zero, isolated points, and blank gaps; repeated events keep separate points", () => {
  const design = (emotions: ReturnType<typeof emptyAudienceDesign>['emotions']) => ({ ...emptyAudienceDesign(), emotions });
  const list = [
    { id: 'first-occurrence', audienceDesign: design({ tension: 0, trust: 30 }) },
    { id: 'second-occurrence', audienceDesign: design({ tension: 100 }) },
    { id: 'empty-occurrence' },
    { id: 'repeated-occurrence', audienceDesign: design({ tension: 45, trust: 90 }) },
  ];
  const before = JSON.stringify(list), series = emotionCurveSeries(list);
  const tension = series.find(s => s.emotion === 'tension')!;
  assert.deepEqual(tension.points.map(p => [p.id, p.index, p.value]), [['first-occurrence', 0, 0], ['second-occurrence', 1, 100], ['repeated-occurrence', 3, 45]]);
  assert.deepEqual(tension.segments.map(s => [s.from.id, s.to.id]), [['first-occurrence', 'second-occurrence']]);
  assert.equal(series.find(s => s.emotion === 'trust')!.segments.length, 0);
  assert.equal(JSON.stringify(list), before);
});
test("authored emotion, cognition and expectations persist independently from observations and truth", () => {
  const p = createTimelineDemo(),
    first = p.timelines.audience.placements[0];
  first.audienceObservations = [
    {
      id: "obs",
      source: "Test screening A, participant 2",
      note: "Reported confusion, not curiosity",
    },
  ];
  const copy = parseProject(JSON.stringify(p));
  assert.deepEqual(copy, p);
  assert.equal(
    copy.timelines.audience.placements[0].audienceDesign?.cognition.believes,
    "可能有人暗中接應",
  );
  assert.equal(
    copy.timelines.audience.placements[0].audienceObservations?.[0].note,
    "Reported confusion, not curiosity",
  );
  assert.ok(!copy.timelines.reality.placements.some((x) => x.audienceDesign));
});
test("old v1 and v2 projects and approval snapshots remain unchanged by audience upgrade", () => {
  const p = createSample();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint", "2026-10-02");
  const saved = JSON.stringify(p),
    next = readSavedProject({ getItem: () => saved }).project;
  assert.deepEqual(next, p);
  assert.ok(!next.timelines.audience.placements[0].audienceDesign);
  const old = JSON.parse(saved);
  old.schemaVersion = 1;
  delete old.timelines;
  const upgraded = parseProject(JSON.stringify(old));
  assert.deepEqual(upgraded.units, p.units);
  assert.ok(!upgraded.timelines.audience.placements[0].audienceDesign);
});
test("audience point edits undo and redo without changing other timelines; approvals retain snapshots", () => {
  const p = createTimelineDemo();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint");
  const s = makeStore(p),
    before = JSON.stringify(
      p.units.find((x) => x.id === "e1")!.stages.blueprint.approvals,
    );
  s.getState().transact((q) =>
    patchOccurrence(q, "audience", "audience-disclosure-0", {
      audienceDesign: { ...emptyAudienceDesign(), emotions: { tension: 99 } },
    }),
  );
  assert.equal(
    s.getState().project.timelines.audience.placements[0].audienceDesign
      ?.emotions.tension,
    99,
  );
  assert.deepEqual(s.getState().project.timelines.reality, p.timelines.reality);
  assert.deepEqual(
    s.getState().project.timelines.narrative,
    p.timelines.narrative,
  );
  assert.equal(
    JSON.stringify(
      s.getState().project.units.find((x) => x.id === "e1")!.stages.blueprint
        .approvals,
    ),
    before,
  );
  s.getState().undo();
  assert.deepEqual(s.getState().project, p);
  s.getState().redo();
  assert.equal(
    s.getState().project.timelines.audience.placements[0].audienceDesign
      ?.emotions.tension,
    99,
  );
});
test("repeated presentations have independent audience interpretation and emotion design", () => {
  const p = createTimelineDemo(),
    a = p.timelines.audience.placements[0],
    b = p.timelines.audience.placements[3];
  assert.equal(a.eventId, b.eventId);
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a.audienceDesign, b.audienceDesign);
  patchOccurrence(p, "audience", b.id, {
    audienceDesign: emptyAudienceDesign(),
  });
  assert.equal(a.audienceDesign?.emotions.curiosity, 75);
});
test("deleted and moved response points reset expectations instead of creating invalid links", () => {
  const p = createTimelineDemo();
  removeOccurrence(p, "audience", "audience-disclosure-2");
  validateProject(p);
  assert.equal(
    p.timelines.audience.placements[0].audienceDesign?.expectations[0].response,
    "open",
  );
  assert.ok(
    !p.timelines.audience.placements[2].audienceDesign?.supportIds.includes(
      "audience-disclosure-2",
    ),
  );
  const q = createTimelineDemo();
  moveOccurrences(
    q,
    "audience",
    ["audience-disclosure-2"],
    "audience-disclosure-0",
  );
  validateProject(q);
  assert.equal(
    q.timelines.audience.placements.find(
      (x) => x.id === "audience-disclosure-0",
    )!.audienceDesign?.expectations[0].responseId,
    null,
  );
});
test("invalid intensity, orphan evidence, chronology and unsourced feedback are rejected", () => {
  for (const edit of [
    (p: ReturnType<typeof createTimelineDemo>) => {
      p.timelines.audience.placements[0].audienceDesign!.emotions.tension = 101;
    },
    (p: ReturnType<typeof createTimelineDemo>) => {
      p.timelines.audience.placements[0].audienceDesign!.supportIds = [
        "missing",
      ];
    },
    (p: ReturnType<typeof createTimelineDemo>) => {
      p.timelines.audience.placements[0].audienceDesign!.expectations[0].responseId =
        "audience-disclosure-0";
    },
    (p: ReturnType<typeof createTimelineDemo>) => {
      p.timelines.audience.placements[0].audienceObservations = [
        { id: "o", source: " ", note: "claim" },
      ];
    },
    (p: ReturnType<typeof createTimelineDemo>) => {
      p.timelines.reality.placements[0].audienceDesign = emptyAudienceDesign();
    },
  ]) {
    const p = createTimelineDemo();
    edit(p);
    assert.throws(() => validateProject(p));
  }
});
test("optional experience fields reject false, null, arrays and wrong nested shape", () => {
  for (const field of ["audienceDesign", "audienceObservations"])
    for (const value of [false, null, 1, "bad", {}]) {
      const p = createTimelineDemo() as any;
      p.timelines.audience.placements[0][field] = value;
      assert.throws(() => validateProject(p));
    }
});
test("recording screening feedback preserves approval and authored revisions", async () => {
  const { setAudienceObservations } = await import("./audience");
  const p = createTimelineDemo();
  reviewStage(p, "e1", "blueprint");
  approveStage(p, "e1", "blueprint");
  const units = structuredClone(p.units),
    revision = p.timelines.audience.revision;
  setAudienceObservations(p, "audience-disclosure-0", [
    { id: "o", source: "Screening 1", note: "Confusion" },
  ]);
  validateProject(p);
  assert.deepEqual(p.units, units);
  assert.equal(p.timelines.audience.revision, revision);
});
