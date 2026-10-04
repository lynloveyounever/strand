import type { Project } from "./model";
export const emotionTypes = [
  "curiosity",
  "tension",
  "trust",
  "sadness",
  "relief",
] as const;
export type Emotion = (typeof emotionTypes)[number];
export const emotionColors: Record<Emotion, string> = {
  curiosity: "#61d7ff",
  tension: "#ff877b",
  trust: "#b9a1ff",
  sadness: "#77a5ff",
  relief: "#80e2b0",
};
export type AudienceDesign = {
  /** Explicit prior-disclosure requirements; broken references remain repairable. */
  requiredEarlierIds?: string[];
  example?: true;
  emotions: Partial<Record<Emotion, number>>;
  cognition: { knows: string; believes: string; questions: string };
  supportIds: string[];
  expectations: {
    id: string;
    kind: "prediction" | "hope" | "fear";
    text: string;
    response: "open" | "realized" | "delayed" | "subverted";
    responseId: string | null;
  }[];
};
export type AudienceObservation = { id: string; source: string; note: string };
export const emptyAudienceDesign = (): AudienceDesign => ({
  emotions: {},
  cognition: { knows: "", believes: "", questions: "" },
  supportIds: [],
  expectations: [],
});
/** Only connect adjacent authored values. Missing values are gaps, never zero. */
export function emotionCurveSeries(
  occurrences: readonly { id: string; audienceDesign?: AudienceDesign }[],
) {
  return emotionTypes.map((emotion) => {
    const points = occurrences.flatMap((o, index) => {
      const value = o.audienceDesign?.emotions[emotion];
      return value === undefined ? [] : [{ id: o.id, index, value }];
    });
    const segments = points.slice(1).flatMap((to, i) => {
      const from = points[i];
      return to.index === from.index + 1 ? [{ from, to }] : [];
    });
    return { emotion, points, segments };
  });
}
export function validateAudience(p: Project) {
  const list = p.timelines.audience.placements,
    ids = new Set(list.map((x) => x.id));
  const fail = () => {
    throw new Error("Invalid project: audience experience data or links");
  };
  const text = (x: unknown) => typeof x === "string" && x.length <= 20000;
  for (const basis of ["reality", "narrative", "audience"] as const)
    for (const item of p.timelines[basis].placements) {
      const d = item.audienceDesign;
      if (d !== undefined) {
        if (!d || typeof d !== "object" || Array.isArray(d)) fail();
        if (
          Array.isArray(d.emotions) ||
          Array.isArray(d.cognition) ||
          (d.example !== undefined && d.example !== true) ||
          basis !== "audience" ||
          !d.emotions ||
          !d.cognition ||
          !Array.isArray(d.supportIds) ||
          !Array.isArray(d.expectations) ||
          d.expectations.length > 100
        )
          fail();
        for (const [k, v] of Object.entries(d.emotions))
          if (
            !emotionTypes.includes(k as Emotion) ||
            typeof v !== "number" ||
            !Number.isFinite(v) ||
            v < 0 ||
            v > 100
          )
            fail();
        for (const k of ["knows", "believes", "questions"] as const)
          if (!text(d.cognition[k])) fail();
        if (
          d.supportIds.length > 3000 ||
          d.supportIds.some((id) => !ids.has(id))
        )
          fail();
        if (d.requiredEarlierIds !== undefined && (!Array.isArray(d.requiredEarlierIds) || d.requiredEarlierIds.length > 3000 || new Set(d.requiredEarlierIds).size !== d.requiredEarlierIds.length || d.requiredEarlierIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ['__proto__','constructor','prototype', item.id].includes(id) || p.timelines.reality.placements.some(o => o.id === id) || p.timelines.narrative.placements.some(o => o.id === id)))) fail();
        const seen = new Set<string>();
        for (const e of d.expectations) {
          if (
            !text(e.id) ||
            seen.has(e.id) ||
            !text(e.text) ||
            !["prediction", "hope", "fear"].includes(e.kind) ||
            !["open", "realized", "delayed", "subverted"].includes(e.response)
          )
            fail();
          seen.add(e.id);
          if (
            e.responseId !== null &&
            (!ids.has(e.responseId) ||
              list.findIndex((x) => x.id === e.responseId) <=
                list.indexOf(item))
          )
            fail();
          if ((e.response === "open") !== (e.responseId === null)) fail();
        }
      }
      if (item.audienceObservations !== undefined) {
        if (
          basis !== "audience" ||
          !Array.isArray(item.audienceObservations) ||
          item.audienceObservations.length > 100
        )
          fail();
        const seen = new Set<string>();
        for (const o of item.audienceObservations) {
          if (
            !text(o.id) ||
            seen.has(o.id) ||
            !text(o.source) ||
            !o.source.trim() ||
            !text(o.note)
          )
            fail();
          seen.add(o.id);
        }
      }
    }
}
export function reconcileAudience(p: Project) {
  const list = p.timelines.audience.placements,
    ids = new Set(list.map((x) => x.id));
  for (const [i, item] of list.entries())
    if (item.audienceDesign) {
      item.audienceDesign.supportIds = item.audienceDesign.supportIds.filter(
        (id) => ids.has(id),
      );
      for (const e of item.audienceDesign.expectations)
        if (e.responseId && list.findIndex((x) => x.id === e.responseId) <= i) {
          e.responseId = null;
          e.response = "open";
        }
    }
}

// Measured feedback is evidence about a screening, not a blueprint revision.
export function setAudienceObservations(
  p: Project,
  occurrenceId: string,
  observations: AudienceObservation[],
) {
  const item = p.timelines.audience.placements.find(
    (x) => x.id === occurrenceId,
  );
  if (!item) throw new Error("Audience occurrence not found");
  item.audienceObservations = observations;
}
