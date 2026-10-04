import { reconcileTimelines, timelineLength, type TimeBasis } from "./temporal";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  clone,
  orderedBeats,
  parseProject,
  validateProject,
  type Project,
} from "./model";
import { createSample, createTimelineDemo } from "./sample";
export const STORAGE_KEY = "narrative-atlas.project.v1";
export interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  selectedId: string;
  trackId: string;
  lineId: string;
  contentTrackId: string;
  focusRequest: { basis: TimeBasis; occurrenceId: string } | null;
  trackingOwner: string;
  trackingDimension: string;
  hiddenContentTrackIds: string[];
  playhead: number;
  zoom: number;
  panel: "cursor" | "edit" | "stages" | "track" | "compare" | "lines" | "tracking";
  basis: TimeBasis;
  occurrenceId: string;
  outlineOpen: boolean;
  inspectorOpen: boolean;
  saveStatus: string;
  notice: string;
  transact: (fn: (p: Project) => void) => void;
  undo: () => void;
  redo: () => void;
  set: (patch: Partial<EditorState>) => void;
  importProject: (p: Project) => void;
}
export function makeStore(initial: Project = createSample()) {
  const first =
    initial.timelines.reality.placements[0];
  return createStore<EditorState>((set, get) => ({
    project: clone(initial),
    basis: "reality",
    occurrenceId: first.id,
    past: [],
    future: [],
    selectedId: first.eventId,
    trackId: "author",
    lineId: initial.narrativeLines?.[0]?.id ?? "",
    contentTrackId: initial.storyTracks?.[0]?.id ?? "",
    focusRequest: null,
    trackingOwner: "all",
    trackingDimension: "all",
    hiddenContentTrackIds: [],
    playhead: 0.5,
    zoom: 87,
    panel: "cursor",
    outlineOpen: false,
    inspectorOpen: false,
    saveStatus: "Local autosave",
    notice: "",
    set: (patch) => set(patch),
    transact: (fn) => {
      const s = get(),
        next = clone(s.project);
      try {
        fn(next);
        reconcileTimelines(next, s.project);
        validateProject(next);
        if (JSON.stringify(next) === JSON.stringify(s.project)) return;
        set({
          project: next,
          contentTrackId: next.storyTracks?.some(t => t.id === s.contentTrackId) ? s.contentTrackId : next.storyTracks?.[0]?.id ?? "",
          past: [...s.past.slice(-79), s.project],
          future: [],
          playhead: Math.min(get().playhead, timelineLength(next, get().basis)),
          selectedId: next.units.some((n) => n.id === get().selectedId)
            ? get().selectedId
            : next.units[0].id,
          lineId: next.narrativeLines?.some(l=>l.id===s.lineId) ? s.lineId : next.narrativeLines?.[0]?.id ?? "",
          notice: "",
        });
      } catch (e) {
        set({
          notice: (e as Error).message,
          selectedId: s.selectedId,
          trackId: s.trackId,
        });
      }
    },
    undo: () => {
      const s = get();
      if (!s.past.length) return;
      const p = s.past.at(-1)!;
      set({
        project: p,
        contentTrackId: p.storyTracks?.some(t => t.id === s.contentTrackId) ? s.contentTrackId : p.storyTracks?.[0]?.id ?? "",
        lineId: p.narrativeLines?.some(l=>l.id===s.lineId) ? s.lineId : p.narrativeLines?.[0]?.id ?? "",
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        playhead: Math.min(s.playhead, timelineLength(p, s.basis)),
        selectedId: p.units.some((n) => n.id === s.selectedId)
          ? s.selectedId
          : p.units[0].id,
      });
    },
    redo: () => {
      const s = get();
      if (!s.future.length) return;
      const p = s.future[0];
      set({
        project: p,
        contentTrackId: p.storyTracks?.some(t => t.id === s.contentTrackId) ? s.contentTrackId : p.storyTracks?.[0]?.id ?? "",
        lineId: p.narrativeLines?.some(l=>l.id===s.lineId) ? s.lineId : p.narrativeLines?.[0]?.id ?? "",
        past: [...s.past, s.project],
        future: s.future.slice(1),
        playhead: Math.min(s.playhead, timelineLength(p, s.basis)),
        selectedId: p.units.some((n) => n.id === s.selectedId)
          ? s.selectedId
          : p.units[0].id,
      });
    },
    importProject: (p) => {
      const next = validateProject(p),
        s = get();
      set({
        project: next,
        contentTrackId: next.storyTracks?.[0]?.id ?? "",
        focusRequest: null,
        trackingOwner: "all", trackingDimension: "all", hiddenContentTrackIds: [],
        past: [...s.past.slice(-79), s.project],
        future: [],
        selectedId: next.units[0].id,
        lineId: next.narrativeLines?.[0]?.id ?? "",
        occurrenceId: next.timelines.narrative.placements[0].id,
        basis: "narrative",
        trackId: "author",
        playhead: 0,
        notice: "Project imported. Undo restores the previous project.",
      });
    },
  }));
}
export function readSavedProject(storage?: Pick<Storage, "getItem">) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { project: createTimelineDemo(), notice: "" };
    const version = JSON.parse(raw)?.schemaVersion;
    return {
      project: parseProject(raw),
      notice:
        version === 1
          ? "Your existing story is preserved. Independent timeline orders were added; the original save stays untouched until you edit."
          : "",
    };
  } catch {
    return {
      project: createTimelineDemo(),
      notice:
        "Saved data could not be read. The original storage is untouched until you edit. Import a JSON backup to recover.",
    };
  }
}
const initial = readSavedProject(
  typeof localStorage !== "undefined" ? localStorage : undefined,
);
export const editor = makeStore(initial.project);
editor.setState({ notice: initial.notice });
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
export function saveNow() {
  if (!dirty) return;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(editor.getState().project),
    );
    editor.setState({ saveStatus: "Saved on this device" });
  } catch {
    editor.setState({
      saveStatus: "Save failed · export a backup",
      notice:
        "Browser storage is unavailable or full. Export JSON to keep your work.",
    });
  }
}
editor.subscribe((state, old) => {
  if (state.project !== old.project) {
    dirty = true;
    editor.setState({ saveStatus: "Saving…" });
    clearTimeout(timer);
    timer = setTimeout(saveNow, 300);
  }
});
export function useEditor<T>(selector: (s: EditorState) => T) {
  return useStore(editor, selector);
}
