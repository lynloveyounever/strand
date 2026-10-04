import { captureContentTracks, validateStoryTracks, type ContentTrack } from './storyTracks';
import { validateWorldTiming, type RealityTiming } from './worldTiming';
import { validateAudienceEngine, type AudienceEngineProject } from './audienceSimulation';
import { validateLines, type NarrativeLine } from './lines';
import { validateAudience } from './audience';
import {
  bases,
  invalidateTemporalCache,
  initialTimelines,
  migrateProject,
  reconcileTimelines,
  syncNarrativeHierarchy,
  type Timelines,
} from "./temporal";
export type Kind = "story" | "act" | "sequence" | "scene" | "beat";
export type Scale = "Story" | "Sequences" | "Scenes" | "Beats";
export type StageName = "blueprint" | "actor" | "director";
export type Snapshot = {
  state: string;
  knowledge: string;
  goal: string;
  obstacle: string;
  motivation: string;
};
export type Approval = {
  revision: number;
  text: string;
  at: string;
  blueprintRevision: number;
  snapshot: string;
};
export type Stage = {
  text: string;
  revision: number;
  status: "draft" | "review" | "approved";
  blueprintRevision: number;
  approvals: Approval[];
};
export type StoryLogic = { cause: string; causeEventId?: string; outcome: string };
export type StoryCraft = { opposition: string; turn: string };
export type Unit = {
  craft?: StoryCraft;
  storyLogic?: StoryLogic;
  id: string;
  parentId: string | null;
  kind: Kind;
  title: string;
  summary: string;
  eventType: "action" | "dialogue" | "foreshadow" | "reveal";
  intent: string;
  audienceEffect: string;
  turningPoint: boolean;
  stages: Record<StageName, Stage>;
};
export type Track = {
  id: string;
  name: string;
  kind: "character" | "audience";
  color: string;
  description: string;
  initial: Snapshot;
};
export type Transition = {
  /** Explicit author-selected source; absent means no dependency claim. */
  motivationSource?: { eventId: string | null };
  themeLink?: string;
  eventId: string;
  trackId: string;
  interpretation: string;
  reaction: string;
  after: Snapshot;
};
export type Project = {
  themeQuestion?: string;
  storyTracks?: ContentTrack[];
  realityTiming?: RealityTiming;
  sampleKind?: "fog-harbor";
  audienceEngine?: AudienceEngineProject;
  narrativeLines?: NarrativeLine[];
  schemaVersion: 2;
  timelines: Timelines;
  title: string;
  premise: string;
  units: Unit[];
  tracks: Track[];
  transitions: Transition[];
};
export type Range = { start: number; end: number };
export const kinds: Kind[] = ["story", "act", "sequence", "scene", "beat"];
export const stages: StageName[] = ["blueprint", "actor", "director"];
export const fields: (keyof Snapshot)[] = [
  "state",
  "knowledge",
  "goal",
  "obstacle",
  "motivation",
];
export const emptySnapshot = (): Snapshot => ({
  state: "Unstated",
  knowledge: "",
  goal: "",
  obstacle: "",
  motivation: "",
});
export const blankStages = (): Record<StageName, Stage> =>
  Object.fromEntries(
    stages.map((k) => [
      k,
      {
        text: "",
        revision: 1,
        status: "draft",
        blueprintRevision: 1,
        approvals: [],
      },
    ]),
  ) as unknown as Record<StageName, Stage>;
export const clone = <T>(x: T): T => structuredClone(x);
export const uid = () =>
  `u-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const children = (p: Project, id: string | null) =>
  p.units.filter((n) => n.parentId === id);
export function descendants(p: Project, id: string): Unit[] {
  return children(p, id).flatMap((n) => [n, ...descendants(p, n.id)]);
}
export function orderedBeats(p: Project): Unit[] {
  const root = p.units.find((n) => n.kind === "story");
  return root ? descendants(p, root.id).filter((n) => n.kind === "beat") : [];
}
export function ranges(p: Project): Map<string, Range> {
  const leaves = orderedBeats(p),
    result = new Map<string, Range>();
  leaves.forEach((n, i) => result.set(n.id, { start: i, end: i + 1 }));
  for (const kind of [...kinds].reverse().slice(1)) {
    for (const n of p.units.filter((n) => n.kind === kind)) {
      const rr = children(p, n.id)
        .map((c) => result.get(c.id)!)
        .filter(Boolean);
      result.set(n.id, {
        start: Math.min(...rr.map((r) => r.start)),
        end: Math.max(...rr.map((r) => r.end)),
      });
    }
  }
  return result;
}
export const scaleAt = (z: number): Scale =>
  z < 25 ? "Story" : z < 50 ? "Sequences" : z < 75 ? "Scenes" : "Beats";
export const kindAt = (z: number): Kind =>
  (
    ({
      Story: "act",
      Sequences: "sequence",
      Scenes: "scene",
      Beats: "beat",
    }) as const
  )[scaleAt(z)];
export const zoomFor = (s: Scale) =>
  ({ Story: 12, Sequences: 37, Scenes: 62, Beats: 87 })[s];
export function visibleUnits(p: Project, z: number) {
  const rr = ranges(p);
  return p.units
    .filter((n) => n.kind === kindAt(z))
    .sort((a, b) => rr.get(a.id)!.start - rr.get(b.id)!.start);
}
export function stateAt(
  p: Project,
  trackId: string,
  position: number,
): { snapshot: Snapshot; eventId: string | null } {
  const t = p.tracks.find((t) => t.id === trackId);
  let snapshot = t?.initial ?? emptySnapshot(),
    eventId: string | null = null;
  orderedBeats(p).forEach((n, i) => {
    if (i + 0.5 <= position) {
      const change = p.transitions.find(
        (x) => x.eventId === n.id && x.trackId === trackId,
      );
      if (change) {
        snapshot = change.after;
        eventId = n.id;
      }
    }
  });
  return { snapshot, eventId };
}
export function trackRange(p: Project, trackId: string, range: Range) {
  return {
    before: stateAt(p, trackId, range.start - 0.001).snapshot,
    after: stateAt(p, trackId, range.end - 0.001).snapshot,
    changes: orderedBeats(p)
      .slice(range.start, range.end)
      .flatMap((n) =>
        p.transitions.filter(
          (t) => t.trackId === trackId && t.eventId === n.id,
        ),
      ),
  };
}
export function updateBlueprint(p: Project, nodeId: string) {
  invalidateTemporalCache(p);
  const n = p.units.find((n) => n.id === nodeId)!;
  const affected = new Set([n.id, ...descendants(p, n.id).map((x) => x.id)]);
  let parent = n.parentId;
  while (parent) {
    affected.add(parent);
    parent = p.units.find((x) => x.id === parent)?.parentId ?? null;
  }
  for (const unit of p.units) {
    if (affected.has(unit.id)) {
      unit.stages.blueprint.revision++;
      unit.stages.blueprint.status = "draft";
    }
  }
}
function invalidateArrangement(p: Project) {
  invalidateTemporalCache(p);
  for (const unit of p.units) {
    unit.stages.blueprint.revision++;
    unit.stages.blueprint.status = "draft";
  }
}
export function editUnit(
  p: Project,
  id: string,
  patch: Partial<Omit<Unit, "id" | "parentId" | "kind" | "stages">>,
) {
  const n = p.units.find((n) => n.id === id);
  if (!n) return;
  Object.assign(n, patch);
  updateBlueprint(p, id);
}
export function setTransition(p: Project, t: Transition) {
  const i = p.transitions.findIndex(
    (x) => x.eventId === t.eventId && x.trackId === t.trackId,
  );
  if (i < 0) p.transitions.push(t);
  else p.transitions[i] = t;
  updateBlueprint(p, t.eventId);
}
export function editStage(
  p: Project,
  id: string,
  key: StageName,
  text: string,
) {
  const n = p.units.find((n) => n.id === id)!;
  const s = n.stages[key];
  s.text = text;
  if (key === "blueprint") updateBlueprint(p, id);
  else {
    s.revision++;
    s.status = "draft";
  }
}
export function reviewStage(p: Project, id: string, key: StageName) {
  const n = p.units.find((n) => n.id === id)!;
  if (
    key !== "blueprint" &&
    n.stages[key].blueprintRevision !== n.stages.blueprint.revision
  )
    throw new Error(
      "Link this realization to the current blueprint before review.",
    );
  n.stages[key].status = "review";
}
export function approveStage(
  p: Project,
  id: string,
  key: StageName,
  at = new Date().toISOString(),
) {
  const n = p.units.find((n) => n.id === id)!;
  const s = n.stages[key];
  if (s.status !== "review") throw new Error("Request review before approval.");
  if (
    key !== "blueprint" &&
    s.blueprintRevision !== n.stages.blueprint.revision
  )
    throw new Error("This realization references an earlier blueprint.");
  s.approvals.push({
    revision: s.revision,
    text: s.text,
    at,
    blueprintRevision: key === "blueprint" ? s.revision : s.blueprintRevision,
    snapshot: JSON.stringify({
      unit: {
        id: n.id,
        title: n.title,
        summary: n.summary,
        intent: n.intent,
        audienceEffect: n.audienceEffect,
        storyLogic: n.storyLogic,
        craft: n.craft,
      },
      perspectives: p.tracks,
      storyContext: { title: p.title, premise: p.premise, themeQuestion: p.themeQuestion },
      transitions: p.transitions.filter((t) => [n.id, ...descendants(p, n.id).map(d => d.id)].includes(t.eventId)),
      narrativeLines: (p.narrativeLines ?? []).filter(line => line.eventIds.some(id => [n.id, ...descendants(p, n.id).map(d => d.id)].includes(id))),
      audienceEngineConfig: p.audienceEngine?.config ?? null,
      contentTracks: captureContentTracks(p, n.id),
      realityTiming: p.realityTiming ?? null,
      stage: s.text,
      container: n.parentId,
      range: ranges(p).get(n.id),
      timelines: Object.fromEntries(
        bases.map((basis) => [
          basis,
          {
            revision: p.timelines[basis].revision,
            placements: p.timelines[basis].placements.filter((item) =>
              [n.id, ...descendants(p, n.id).map((d) => d.id)].includes(
                item.eventId,
              ),
            ),
          },
        ]),
      ),
      descendantUnits: descendants(p, n.id).map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        summary: d.summary,
        blueprintRevision: d.stages.blueprint.revision,
        blueprintText: d.stages.blueprint.text,
        storyLogic: d.storyLogic,
        intent: d.intent,
        craft: d.craft,
      })),
    }),
  });
  s.status = "approved";
}
export function rebaseStage(p: Project, id: string, key: StageName) {
  const n = p.units.find((n) => n.id === id)!;
  if (key === "blueprint") return;
  const s = n.stages[key];
  s.blueprintRevision = n.stages.blueprint.revision;
  s.revision++;
  s.status = "draft";
}
export function reorderUnit(p: Project, sourceId: string, targetId: string) {
  const a = p.units.find((n) => n.id === sourceId),
    b = p.units.find((n) => n.id === targetId);
  if (!a || !b || a.kind !== b.kind || a.id === b.id || a.kind === "story")
    return;
  if (a.parentId !== b.parentId && children(p, a.parentId).length < 2)
    throw new Error(
      "Keep at least one unit in each branch. Add a replacement before moving this unit.",
    );
  a.parentId = b.parentId;
  const from = p.units.indexOf(a),
    to = p.units.indexOf(b);
  p.units.splice(from, 1);
  p.units.splice(to, 0, a);
  invalidateArrangement(p);
  syncNarrativeHierarchy(p, a.id, b.id, from < to);
}
export function moveToContainer(p: Project, id: string, parentId: string) {
  const n = p.units.find((x) => x.id === id),
    parent = p.units.find((x) => x.id === parentId);
  if (!n || !parent || kinds.indexOf(parent.kind) !== kinds.indexOf(n.kind) - 1)
    throw new Error("Choose a container one level above this unit.");
  if (n.parentId === parentId) return;
  if (children(p, n.parentId).length < 2)
    throw new Error(
      "Keep one unit in the current container. Add a replacement before moving this unit.",
    );
  n.parentId = parentId;
  invalidateArrangement(p);
  syncNarrativeHierarchy(p);
}
export function moveSibling(p: Project, id: string, direction: number) {
  const n = p.units.find((n) => n.id === id);
  if (!n) return;
  const list = children(p, n.parentId),
    target = list[list.indexOf(n) + direction];
  if (target) reorderUnit(p, id, target.id);
}
export function addUnit(p: Project, parentId: string) {
  const old = clone(p);
  const parent = p.units.find((n) => n.id === parentId)!;
  const depth = kinds.indexOf(parent.kind) + 1;
  if (depth > 4) return null;
  invalidateArrangement(p);
  let previous = parentId,
    first = "";
  for (let i = depth; i < kinds.length; i++) {
    const id = uid();
    if (!first) first = id;
    p.units.push({
      id,
      parentId: previous,
      kind: kinds[i],
      title: `New ${kinds[i]}`,
      summary: "",
      eventType: "action",
      intent: "",
      audienceEffect: "",
      turningPoint: false,
      stages: blankStages(),
    });
    previous = id;
  }
  reconcileTimelines(p, old);
  return first;
}
export function removeUnit(p: Project, id: string) {
  const old = clone(p);
  const n = p.units.find((n) => n.id === id);
  if (!n || n.kind === "story") return;
  if (children(p, n.parentId).length < 2)
    throw new Error(
      "Keep one unit in each branch. Delete its parent instead, or add another unit first.",
    );
  const ids = new Set([id, ...descendants(p, id).map((n) => n.id)]);
  p.units = p.units.filter((n) => !ids.has(n.id));
  p.transitions = p.transitions.filter((t) => !ids.has(t.eventId));
  for (const unit of p.units) if (unit.storyLogic?.causeEventId && ids.has(unit.storyLogic.causeEventId)) delete unit.storyLogic.causeEventId;
  reconcileTimelines(p, old);
  invalidateArrangement(p);
}
function fail(message: string): never {
  throw new Error(`Invalid project: ${message}`);
}
function object(x: unknown): Record<string, any> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    fail("expected an object");
  return x as Record<string, any>;
}
function str(x: unknown, where: string, max = 20000): asserts x is string {
  if (typeof x !== "string" || x.length > max)
    fail(where + " must be text (up to " + max + " characters)");
}
function identifier(x: unknown) {
  str(x, "id", 100);
  if (
    !/^[a-zA-Z0-9_-]+$/.test(x) ||
    ["__proto__", "constructor", "prototype"].includes(x)
  )
    fail("unsafe id");
}
function snapshot(x: unknown) {
  const v = object(x);
  for (const k of fields) str(v[k], k);
}
export function validateProject(input: unknown): Project {
  const p = object(input);
  if (p.schemaVersion !== 1 && p.schemaVersion !== 2)
    fail("unsupported schema version");
  str(p.title, "title", 300);
  str(p.premise, "premise");
  if (p.themeQuestion !== undefined) str(p.themeQuestion, "theme question");
  if (p.sampleKind !== undefined && p.sampleKind !== "fog-harbor") fail("sample marker");
  if (!Array.isArray(p.units) || p.units.length < 5 || p.units.length > 1000)
    fail("units must contain 5–1000 entries");
  if (!Array.isArray(p.tracks) || p.tracks.length > 24)
    fail("at most 24 perspective tracks");
  if (!Array.isArray(p.transitions) || p.transitions.length > 24000)
    fail("too many event links");
  const ids = new Set<string>();
  for (const value of p.units) {
    const n = object(value);
    identifier(n.id);
    if (ids.has(n.id)) fail("duplicate unit id");
    ids.add(n.id);
    if (!kinds.includes(n.kind)) fail("unknown unit kind");
    if (n.parentId !== null) identifier(n.parentId);
    for (const k of ["title", "summary", "intent", "audienceEffect"])
      str(n[k], k);
    if (
      !["action", "dialogue", "foreshadow", "reveal"].includes(n.eventType) ||
      typeof n.turningPoint !== "boolean"
    )
      fail("event metadata");
    if (n.craft !== undefined) {
      const craft = object(n.craft);
      str(craft.opposition, "story opposition");
      str(craft.turn, "story turn");
    }
    if (n.storyLogic !== undefined) {
      const logic = object(n.storyLogic);
      str(logic.cause, "story cause"); str(logic.outcome, "story outcome");
      if (logic.causeEventId !== undefined && (logic.causeEventId === n.id || !p.units.some((u: Unit) => u.id === logic.causeEventId && u.kind === "beat"))) fail("invalid causal event reference");
    }
    for (const key of stages) {
      const s = object(object(n.stages)[key]);
      str(s.text, "stage text");
      if (
        !Number.isInteger(s.revision) ||
        s.revision < 1 ||
        !Number.isInteger(s.blueprintRevision) ||
        s.blueprintRevision < 1 ||
        !["draft", "review", "approved"].includes(s.status)
      )
        fail("stage revision");
      if (!Array.isArray(s.approvals) || s.approvals.length > 1000)
        fail("approval history");
      for (const a0 of s.approvals) {
        const a = object(a0);
        str(a.text, "approval text");
        str(a.snapshot, "approval snapshot", 1000000);
        try {
          object(JSON.parse(a.snapshot));
        } catch {
          fail("approval snapshot must be valid JSON");
        }
        str(a.at, "approval date", 100);
        if (
          !Number.isInteger(a.revision) ||
          a.revision < 1 ||
          a.revision > s.revision ||
          !Number.isInteger(a.blueprintRevision) ||
          a.blueprintRevision < 1
        )
          fail("approval revision");
      }
    }
  }
  const roots = p.units.filter((n: Unit) => n.kind === "story");
  if (roots.length !== 1 || roots[0].parentId !== null)
    fail("one story root required");
  for (const n of p.units as Unit[]) {
    if (n.kind === "story") continue;
    const parent = p.units.find((x: Unit) => x.id === n.parentId);
    if (!parent || kinds.indexOf(parent.kind) !== kinds.indexOf(n.kind) - 1)
      fail("broken hierarchy");
  }
  for (const n of p.units as Unit[])
    if (n.kind !== "beat" && !p.units.some((x: Unit) => x.parentId === n.id))
      fail("empty hierarchy branch");
  const trackIds = new Set<string>();
  for (const t0 of p.tracks) {
    const t = object(t0);
    identifier(t.id);
    if (trackIds.has(t.id)) fail("duplicate track id");
    trackIds.add(t.id);
    for (const k of ["name", "description"]) str(t[k], k);
    if (
      !["character", "audience"].includes(t.kind) ||
      !/^#[0-9a-fA-F]{6}$/.test(t.color)
    )
      fail("track metadata");
    snapshot(t.initial);
  }
  const links = new Set<string>();
  for (const t0 of p.transitions) {
    const t = object(t0);
    if (
      !trackIds.has(t.trackId) ||
      !p.units.some((n: Unit) => n.id === t.eventId && n.kind === "beat")
    )
      fail("orphan event link");
    const key = t.eventId + "|" + t.trackId;
    if (links.has(key)) fail("duplicate event link");
    links.add(key);
    str(t.interpretation, "interpretation");
    str(t.reaction, "reaction");
    if (t.themeLink !== undefined) str(t.themeLink, "choice theme link");
    if (t.motivationSource !== undefined) {
      const source = object(t.motivationSource);
      if (source.eventId !== null) identifier(source.eventId);
      if (source.eventId === t.eventId) fail("motivation cannot depend on its own after-state");
      if (p.units.some((u: Unit) => u.id === source.eventId && u.kind !== "beat")) fail("motivation source must be an event");
      if (!p.tracks.some((track: Track) => track.id === t.trackId && track.kind === "character")) fail("motivation dependency must belong to a character");
    }
    snapshot(t.after);
  }
  if (p.schemaVersion === 1) return validateProject(migrateProject(p as Project));
  const timelines = object(p.timelines);
  const occurrenceIds = new Set<string>();
  for (const basis of bases) {
    const timeline = object(timelines[basis]);
    if (!Number.isSafeInteger(timeline.revision) || timeline.revision < 1)
      fail("timeline revision");
    if (
      !Array.isArray(timeline.placements) ||
      timeline.placements.length < 1 ||
      timeline.placements.length > 3000
    )
      fail("timeline must have 1–3000 occurrences");
    const realityEvents = new Set<string>();
    for (const value of timeline.placements) {
      const item = object(value);
      identifier(item.id);
      if (occurrenceIds.has(item.id)) fail("duplicate occurrence id");
      occurrenceIds.add(item.id);
      if (
        !p.units.some((n: Unit) => n.id === item.eventId && n.kind === "beat")
      )
        fail("orphan occurrence event");
      if (
        !p.units.some(
          (n: Unit) => n.id === item.containerId && n.kind === "scene",
        )
      )
        fail("orphan occurrence container");
      if (basis === "reality") {
        if (realityEvents.has(item.eventId))
          fail("Reality repeats a canonical event");
        realityEvents.add(item.eventId);
      }
      if (
        ![
          "present",
          "flashback",
          "flashforward",
          "repeat",
          "disclosure",
        ].includes(item.mode) ||
        !["scene", "summary", "ellipsis", "pause"].includes(item.pacing) ||
        !["withheld", "partial", "misleading", "confirmed"].includes(
          item.disclosure,
        )
      )
        fail("occurrence metadata");
      str(item.note, "occurrence note");
      str(item.knowledgeNote, "disclosure note");
      if (!Array.isArray(item.updates) || item.updates.length > 24)
        fail("occurrence states");
      const stateTracks = new Set<string>();
      for (const u0 of item.updates) {
        const u = object(u0);
        if (!trackIds.has(u.trackId) || stateTracks.has(u.trackId))
          fail("occurrence state track");
        stateTracks.add(u.trackId);
        str(u.interpretation, "interpretation");
        str(u.reaction, "reaction");
        if (u.themeLink !== undefined) str(u.themeLink, "choice theme link");
        snapshot(u.after);
      }
    }
  }
  validateAudience(p as Project);
  validateAudienceEngine(p as Project);
  validateLines(p as Project);
  validateWorldTiming(p as Project);
  validateStoryTracks(p as Project);
  return clone(p as Project);
}
export function parseProject(text: string) {
  if (text.length > 8_000_000) fail("file exceeds 8 MB");
  return validateProject(JSON.parse(text));
}

// Cached read-only projection: consumers pass immutable committed project snapshots.
// Mutation helpers deliberately use uncached traversal, so in-transaction edits stay correct.
const projectionCache = new WeakMap<
  Project,
  ReturnType<typeof buildProjection>
>();
function buildProjection(p: Project) {
  const beats = orderedBeats(p),
    rr = ranges(p);
  const linked = new Map(
    p.transitions.map((t) => [t.trackId + "|" + t.eventId, t]),
  );
  const stateSeries = new Map<string, Snapshot[]>();
  for (const track of p.tracks) {
    const states = [track.initial];
    for (const beat of beats)
      states.push(
        linked.get(track.id + "|" + beat.id)?.after ?? states.at(-1)!,
      );
    stateSeries.set(track.id, states);
  }
  return {
    ranges: rr,
    trackRange: (trackId: string, range: Range) => {
      const series = stateSeries.get(trackId)!;
      return {
        before: series[range.start],
        after: series[range.end],
        changes: beats.slice(range.start, range.end).flatMap((b) => {
          const t = linked.get(trackId + "|" + b.id);
          return t ? [t] : [];
        }),
      };
    },
  };
}
export function timelineProjection(p: Project) {
  let projection = projectionCache.get(p);
  if (!projection) {
    projection = buildProjection(p);
    projectionCache.set(p, projection);
  }
  return projection;
}

export function createBlankProject(): Project {
  const units: Unit[] = kinds.map((kind, i) => ({
    id: "new-" + kind,
    parentId: i === 0 ? null : "new-" + kinds[i - 1],
    kind,
    title: ({ story: "未命名故事", act: "第一幕", sequence: "第一段", scene: "第一場", beat: "事件 1" })[kind],
    summary: "",
    eventType: "action",
    intent: "",
    audienceEffect: "",
    turningPoint: false,
    stages: blankStages(),
  }));
  const project: Project = {
    schemaVersion: 2,
    timelines: {} as Timelines,
    title: "未命名故事",
    premise: "",
    units,
    tracks: [],
    transitions: [],
  };
  project.timelines = initialTimelines(project);
  return project;
}
