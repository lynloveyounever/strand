import { reconcileStoryTracks } from './storyTracks';
import { compareWorldEvents, invalidateWorldTiming, partialCharacterState, reconcileWorldTiming } from './worldTiming';
import { reconcileLines } from './lines';
import { reconcileAudience, type AudienceDesign, type AudienceObservation } from './audience';
import {
  blankStages,
  clone,
  descendants,
  emptySnapshot,
  kinds,
  orderedBeats,
  ranges,
  uid,
  updateBlueprint,
  type Kind,
  type Project,
  type Range,
  type Snapshot,
  type Transition,
  type Unit,
} from "./model";
export const bases = ["reality", "narrative", "audience"] as const;
export type TimeBasis = (typeof bases)[number];
export const basisLabels: Record<TimeBasis, string> = {
  reality: "Reality",
  narrative: "Narrative",
  audience: "Audience",
};
export const basisDescriptions: Record<TimeBasis, string> = {
  reality: "What happened in the story world",
  narrative: "The order in which you present it",
  audience: "When understanding changes",
};
export type Occurrence = {
  audienceDesign?: AudienceDesign;
  audienceObservations?: AudienceObservation[];
  id: string;
  eventId: string;
  containerId: string;
  mode: "present" | "flashback" | "flashforward" | "repeat" | "disclosure";
  pacing: "scene" | "summary" | "ellipsis" | "pause";
  disclosure: "withheld" | "partial" | "misleading" | "confirmed";
  note: string;
  knowledgeNote: string;
  updates: Omit<Transition, "eventId">[];
};
export type Timeline = { revision: number; placements: Occurrence[] };
export type Timelines = Record<TimeBasis, Timeline>;
export function newOccurrence(
  p: Project,
  basis: TimeBasis,
  eventId: string,
): Occurrence {
  const event = p.units.find((n) => n.id === eventId && n.kind === "beat");
  if (!event) throw new Error("Choose a shared event.");
  return {
    id: uid(),
    eventId,
    containerId: event.parentId!,
    mode: basis === "audience" ? "disclosure" : "present",
    pacing: "scene",
    disclosure: "withheld",
    note: "",
    knowledgeNote: "",
    updates: [],
  };
}
export function initialTimelines(p: Project): Timelines {
  return Object.fromEntries(
    bases.map((basis) => [
      basis,
      {
        revision: 1,
        placements: orderedBeats(p).map((event, index) => ({
          ...newOccurrence(p, basis, event.id),
          id:
            event.id.length < 80
              ? `${basis}-${event.id}`
              : `${basis}-${index}-${event.id.slice(0, 60)}`,
          disclosure: basis === "reality" ? "confirmed" : "partial",
          updates:
            basis === "reality"
              ? []
              : p.transitions
                  .filter(
                    (t) =>
                      t.eventId === event.id &&
                      p.tracks.find((x) => x.id === t.trackId)?.kind ===
                        "audience",
                  )
                  .map(({ eventId, ...t }) => clone(t)),
        })),
      },
    ]),
  ) as Timelines;
}
export function migrateProject(p: Project): Project {
  const next = clone(p);
  next.schemaVersion = 2;
  next.timelines = initialTimelines(next);
  return next;
}
export function timelineLength(p: Project, basis: TimeBasis) {
  return p.timelines[basis].placements.length;
}
export function timelineChanged(p: Project, basis: TimeBasis) {
  invalidateTemporalCache(p);
  p.timelines[basis].revision++;
  updateBlueprint(p, p.units.find((n) => n.kind === "story")!.id);
}
export function addOccurrence(
  p: Project,
  basis: TimeBasis,
  eventId: string,
  index?: number,
) {
  const list = p.timelines[basis].placements;
  if (basis === "reality" && list.some((x) => x.eventId === eventId))
    throw new Error(
      "Reality contains each canonical event once. Repeat its presentation in Narrative or Audience.",
    );
  const occurrence = newOccurrence(p, basis, eventId);
  list.splice(
    index === undefined
      ? list.length
      : Math.max(0, Math.min(index, list.length)),
    0,
    occurrence,
  );
  timelineChanged(p, basis);
  return occurrence.id;
}
export function removeOccurrence(p: Project, basis: TimeBasis, id: string) {
  const list = p.timelines[basis].placements;
  if (list.length === 1)
    throw new Error("Keep one occurrence on each timeline.");
  p.timelines[basis].placements = list.filter((x) => x.id !== id);
  reconcileAudience(p);
  reconcileLines(p);
  timelineChanged(p, basis);
}
export function moveOccurrences(
  p: Project,
  basis: TimeBasis,
  ids: string[],
  targetId: string,
) {
  const list = p.timelines[basis].placements;
  const moving = list.filter((x) => ids.includes(x.id));
  if (!moving.length || ids.includes(targetId)) return;
  const from = list.findIndex((x) => x.id === moving[0].id),
    target = list.findIndex((x) => x.id === targetId);
  if (target < 0) return;
  const remaining = list.filter((x) => !ids.includes(x.id));
  const at =
    remaining.findIndex((x) => x.id === targetId) + (from < target ? 1 : 0);
  remaining.splice(at, 0, ...moving);
  p.timelines[basis].placements = remaining;
  reconcileAudience(p);
  reconcileLines(p);
  timelineChanged(p, basis);
}
export function patchOccurrence(
  p: Project,
  basis: TimeBasis,
  id: string,
  patch: Partial<Omit<Occurrence, "id" | "eventId">>,
) {
  const item = p.timelines[basis].placements.find((x) => x.id === id);
  if (!item) throw new Error("Occurrence not found.");
  Object.assign(item, patch);
  timelineChanged(p, basis);
}
export function setOccurrenceState(
  p: Project,
  basis: TimeBasis,
  id: string,
  update: Omit<Transition, "eventId">,
) {
  const item = p.timelines[basis].placements.find((x) => x.id === id);
  if (!item) throw new Error("Occurrence not found.");
  const at = item.updates.findIndex((x) => x.trackId === update.trackId);
  if (at < 0) item.updates.push(update);
  else item.updates[at] = update;
  timelineChanged(p, basis);
}
export function reconcileTimelines(p: Project, old: Project) {
  const eventIds = new Set(
    p.units.filter((n) => n.kind === "beat").map((n) => n.id),
  );
  const scenes = new Set(
    p.units.filter((n) => n.kind === "scene").map((n) => n.id),
  );
  const oldIds = new Set(old.units.map((n) => n.id));
  for (const basis of bases) {
    const timeline = p.timelines[basis];
    timeline.placements = timeline.placements.filter((x) =>
      eventIds.has(x.eventId),
    );
    for (const item of timeline.placements) {
      if (!scenes.has(item.containerId))
        item.containerId = p.units.find(
          (n) => n.id === item.eventId,
        )!.parentId!;
      item.updates = item.updates.filter((u) =>
        p.tracks.some((t) => t.id === u.trackId),
      );
    }
    for (const event of p.units.filter(
      (n) =>
        n.kind === "beat" &&
        !oldIds.has(n.id) &&
        !timeline.placements.some((x) => x.eventId === n.id),
    ))
      timeline.placements.push(newOccurrence(p, basis, event.id));
    if (!timeline.placements.length) {
      const first = p.units.find((n) => n.kind === "beat")!;
      timeline.placements.push(newOccurrence(p, basis, first.id));
    }
  }
  reconcileAudience(p);
  reconcileLines(p);
  reconcileWorldTiming(p, old);
  reconcileStoryTracks(p, old);
}
export function syncNarrativeHierarchy(
  p: Project,
  sourceId?: string,
  targetId?: string,
  after = false,
) {
  if (!p.timelines) return;
  const timeline = p.timelines.narrative;
  if (sourceId && targetId) {
    const source = new Set([
        sourceId,
        ...descendants(p, sourceId).map((n) => n.id),
      ]),
      target = new Set([
        targetId,
        ...descendants(p, targetId).map((n) => n.id),
      ]);
    const moving = timeline.placements.filter((item) =>
      source.has(item.eventId),
    );
    const remaining = timeline.placements.filter(
      (item) => !source.has(item.eventId),
    );
    const targetPositions = remaining.flatMap((item, i) =>
      target.has(item.eventId) ? [i] : [],
    );
    if (moving.length && targetPositions.length) {
      const index = after ? targetPositions.at(-1)! + 1 : targetPositions[0];
      remaining.splice(index, 0, ...moving);
      timeline.placements = remaining;
    }
  }
  timeline.revision++;
}
function initialFor(p: Project, trackId: string, basis: TimeBasis): Snapshot {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) return emptySnapshot();
  if (
    (basis === "reality" && track.kind === "audience") ||
    (basis === "audience" && track.kind === "character")
  )
    return {
      ...emptySnapshot(),
      state: basis === "reality" ? "No audience clock" : "Not disclosed",
    };
  return track.initial;
}
type StatePoint = {
  snapshot: Snapshot;
  eventId: string | null;
  occurrenceId: string | null;
};
const stateCache = new WeakMap<Project, ReturnType<typeof buildStateIndex>>();
function buildStateIndex(p: Project) {
  const series = new Map<string, StatePoint[]>(),
    truth = new Map(p.transitions.map((t) => [t.trackId + "|" + t.eventId, t]));
  for (const basis of bases) {
    for (const track of p.tracks) {
      const values: StatePoint[] = [
        {
          snapshot: initialFor(p, track.id, basis),
          eventId: null,
          occurrenceId: null,
        },
      ];
      for (const item of p.timelines[basis].placements) {
        const update =
          basis === "reality"
            ? track.kind === "character"
              ? truth.get(track.id + "|" + item.eventId)
              : undefined
            : item.updates.find((x) => x.trackId === track.id);
        values.push(
          update
            ? {
                snapshot: update.after,
                eventId: item.eventId,
                occurrenceId: item.id,
              }
            : values.at(-1)!,
        );
      }
      series.set(basis + "|" + track.id, values);
    }
  }
  return {
    series,
    realityIndex: new Map(
      p.timelines.reality.placements.map((item, i) => [item.eventId, i]),
    ),
  };
}
export function invalidateTemporalCache(p: Project) {
  stateCache.delete(p);
  cache.delete(p);
  invalidateWorldTiming(p);
}
export function stateAtBasis(
  p: Project,
  trackId: string,
  position: number,
  basis: TimeBasis,
): StatePoint & { source: string; unresolved?: boolean } {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track)
    return {
      snapshot: emptySnapshot(),
      eventId: null,
      occurrenceId: null,
      source: "Not authored",
    };
  if (p.realityTiming && track.kind === 'character' && basis !== 'audience') {
    const list = p.timelines[basis].placements;
    const i = Math.min(list.length - 1, Math.max(0, Math.floor(position))), item = list[i];
    if (item && p.timelines.reality.placements.some(o => o.eventId === item.eventId)) {
      const state = partialCharacterState(p, trackId, item.eventId, position >= i + .5);
      return { ...state, occurrenceId: basis === 'narrative' ? item.id : state.occurrenceId };
    }
  }
  let index = stateCache.get(p);
  if (!index) {
    index = buildStateIndex(p);
    stateCache.set(p, index);
  }
  const list = p.timelines[basis].placements;
  if (basis === "narrative" && track.kind === "character") {
    const i = Math.min(list.length - 1, Math.max(0, Math.floor(position))),
      item = list[i];
    if (!item)
      return {
        snapshot: track.initial,
        eventId: null,
        occurrenceId: null,
        source: "Initial character state",
      };
    const ri = index.realityIndex.get(item.eventId);
    if (ri === undefined)
      return {
        snapshot: { ...emptySnapshot(), state: "Unmapped in Reality" },
        eventId: null,
        occurrenceId: item.id,
        source: "No world-time anchor",
      };
    const after = position >= i + 0.5;
    const result = index.series.get("reality|" + trackId)![
      ri + (after ? 1 : 0)
    ];
    return {
      ...result,
      occurrenceId: item.id,
      source:
        "Character truth at the mapped Reality event; flashbacks revisit earlier state",
    };
  }
  const count = Math.max(0, Math.min(list.length, Math.floor(position + 0.5)));
  const result = index.series.get(basis + "|" + trackId)![count];
  return {
    ...result,
    source:
      basis === "reality"
        ? track.kind === "audience"
          ? "Audience knowledge has no automatic world-time position"
          : "Authored character truth in world order"
        : basis === "audience" && track.kind === "character"
          ? "Audience’s authored model of this character; never copied from private character truth"
          : "Latest explicitly authored disclosure on this timeline",
  };
}
export type ViewUnit = Unit & { canonicalId: string; occurrenceIds: string[] };
const cache = new WeakMap<
  Project,
  Partial<Record<TimeBasis, ReturnType<typeof buildAxisView>>>
>();
function buildAxisView(p: Project, basis: TimeBasis) {
  const placements = p.timelines[basis].placements,
    root = p.units.find((n) => n.kind === "story")!;
  const units: ViewUnit[] = [
    {
      ...root,
      id: "~story",
      canonicalId: root.id,
      occurrenceIds: placements.map((x) => x.id),
    },
  ];
  let active: ViewUnit[] = [];
  placements.forEach((item, index) => {
    const event = p.units.find((n) => n.id === item.eventId)!;
    let container = p.units.find((n) => n.id === item.containerId)!;
    const path: Unit[] = [];
    while (container.kind !== "story") {
      path.unshift(container);
      container = p.units.find((n) => n.id === container.parentId)!;
    }
    let parent = "~story";
    path.forEach((unit, depth) => {
      let group = active[depth];
      if (
        !group ||
        group.canonicalId !== unit.id ||
        group.parentId !== parent
      ) {
        active = active.slice(0, depth);
        group = {
          ...unit,
          id: `~view-${basis}-${depth}-${index}`,
          parentId: parent,
          canonicalId: unit.id,
          occurrenceIds: [],
        };
        units.push(group);
        active[depth] = group;
      }
      group.occurrenceIds.push(item.id);
      parent = group.id;
    });
    units.push({
      ...event,
      id: item.id,
      parentId: parent,
      canonicalId: event.id,
      occurrenceIds: [item.id],
      summary: item.note || event.summary,
    });
  });
  const view: Project = { ...p, units, transitions: [] };
  const rr = ranges(view);
  const projectedTransitions: Transition[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (const track of p.tracks) {
      const after = stateAtBasis(p, track.id, i + 0.5, basis);
      const before = stateAtBasis(p, track.id, i + 0.499, basis);
      const item = placements[i],
        original =
          basis === "reality" ||
          (basis === "narrative" && track.kind === "character")
            ? p.transitions.find(
                (t) => t.eventId === item.eventId && t.trackId === track.id,
              )
            : item.updates.find((t) => t.trackId === track.id);
      if (
        JSON.stringify(before.snapshot) !== JSON.stringify(after.snapshot) ||
        original
      )
        projectedTransitions.push({
          eventId: item.id,
          trackId: track.id,
          interpretation: original?.interpretation ?? "",
          reaction: original?.reaction ?? "",
          after: after.snapshot,
        });
    }
  }
  view.transitions = projectedTransitions;
  return {
    project: view,
    units,
    ranges: rr,
    trackRange: (trackId: string, range: Range) => ({
      before: stateAtBasis(p, trackId, range.start + 0.499, basis).snapshot,
      after: stateAtBasis(p, trackId, range.end - 0.001, basis).snapshot,
      changes: placements
        .slice(range.start, range.end)
        .flatMap((item) =>
          projectedTransitions.filter(
            (t) => t.trackId === trackId && t.eventId === item.id,
          ),
        ),
    }),
  };
}
export function axisView(p: Project, basis: TimeBasis) {
  let map = cache.get(p);
  if (!map) {
    map = {};
    cache.set(p, map);
  }
  return map[basis] ?? (map[basis] = buildAxisView(p, basis));
}
/** A container can have multiple disjoint runs in an independently ordered view. */
export function viewSegmentLabel(units: ViewUnit[], unit: ViewUnit) {
  if (unit.kind === 'beat' || unit.kind === 'story') return '';
  const runs = units.filter(u => u.kind === unit.kind && u.canonicalId === unit.canonicalId);
  return runs.length > 1 ? `第 ${runs.findIndex(u => u.id === unit.id) + 1}/${runs.length} 段` : '';
}
export function eventMappings(p: Project, eventId: string) {
  return bases.map((basis) => ({
    basis,
    items: p.timelines[basis].placements.flatMap((item, index) =>
      item.eventId === eventId ? [{ item, index }] : [],
    ),
  }));
}
export type Diagnostic = {
  kind: "gap" | "check" | "broken";
  message: string;
  basis: TimeBasis;
  occurrenceId?: string;
  eventId?: string;
};
export function diagnostics(p: Project): Diagnostic[] {
  const out: Diagnostic[] = [];
  const eventIds = p.units.filter((n) => n.kind === "beat").map((n) => n.id);
  for (const basis of bases) {
    const list = p.timelines[basis].placements;
    for (const id of eventIds)
      if (!list.some((x) => x.eventId === id))
        out.push({
          kind: "gap",
          basis,
          eventId: id,
          message: `${p.units.find((n) => n.id === id)!.title} has no ${basisLabels[basis]} occurrence. This may be intentional.`,
        });
    list.forEach((item, i) => {
      if (!eventIds.includes(item.eventId)) {
        out.push({
          kind: "broken",
          basis,
          occurrenceId: item.id,
          message: "Occurrence has no canonical event.",
        });
        return;
      }
      const rank = p.timelines.reality.placements.findIndex(
          (x) => x.eventId === item.eventId,
        ),
        previous = i
          ? p.timelines.reality.placements.findIndex(
              (x) => x.eventId === list[i - 1].eventId,
            )
          : -1;
      if (basis !== "reality" && rank < 0)
        out.push({
          kind: "gap",
          basis,
          occurrenceId: item.id,
          message: "This occurrence has no Reality anchor.",
        });
      const relation = i > 0 ? compareWorldEvents(p, item.eventId, list[i - 1].eventId) : 'unknown';
      if (
        item.mode === "flashback" &&
        i > 0 &&
        relation !== "unknown" && relation !== "before" &&
        previous >= 0
      )
        out.push({
          kind: "check",
          basis,
          occurrenceId: item.id,
          message:
            "Marked as flashback, but does not move backward from the previous mapped event. Check the intended reference point.",
        });
      if (
        item.mode === "flashforward" &&
        i > 0 &&
        relation !== "unknown" && relation !== "after" &&
        previous >= 0
      ) {
        out.push({
          kind: "check",
          basis,
          occurrenceId: item.id,
          message:
            "Marked as flash-forward, but does not move ahead of the previous mapped event. Check the intended reference point.",
        });
      }
      if (
        basis !== "reality" &&
        item.disclosure === "confirmed" &&
        !item.updates.some(
          (u) => p.tracks.find((t) => t.id === u.trackId)?.kind === "audience",
        )
      )
        out.push({
          kind: "check",
          basis,
          occurrenceId: item.id,
          message:
            "Marked confirmed, but no audience after-state is authored for this occurrence.",
        });
    });
  }
  return out;
}
