import {
  bases,
  stateAtBasis,
  timelineLength,
  type TimeBasis,
} from "./temporal";
import { editor } from "./store";
import { orderedBeats, stateAt, parseProject } from "./model";
type Tool = {
  name: string;
  description: string;
  title: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export const narrativeTools: Tool[] = [
  {
    name: "read_narrative_at_cursor",
    title: "Read narrative at cursor",
    description:
      "Read authored character or audience states at the current narrative cursor. Does not infer missing states or change the project.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      if (!input || typeof input !== "object" || Object.keys(input).length)
        throw new Error("Expected an empty object");
      const s = editor.getState();
      return {
        title: s.project.title,
        position: s.playhead,
        basis: s.basis,
        units: timelineLength(s.project, s.basis),
        tracks: s.project.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          ...stateAtBasis(s.project, t.id, s.playhead, s.basis),
        })),
      };
    },
  },
  {
    name: "navigate_narrative",
    title: "Navigate narrative",
    description:
      "Move the visible cursor to a narrative-unit position and optionally switch perspective; does not modify authored content.",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "number", minimum: 0 },
        trackId: { type: "string" },
        basis: { type: "string", enum: bases },
      },
      required: ["position"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => {
      const x = input as {
        position?: number;
        trackId?: string;
        basis?: TimeBasis;
      };
      if (x?.basis !== undefined && !bases.includes(x.basis))
        throw new Error("Unknown time basis");
      const basis = x?.basis ?? editor.getState().basis;
      if (
        !x ||
        typeof x !== "object" ||
        Object.keys(x).some(
          (k) => !["position", "trackId", "basis"].includes(k),
        ) ||
        typeof x.position !== "number" ||
        !Number.isFinite(x.position) ||
        x.position < 0 ||
        x.position > timelineLength(editor.getState().project, basis)
      )
        throw new Error("Position outside the story");
      if (
        x.trackId !== undefined &&
        x.trackId !== "author" &&
        !editor.getState().project.tracks.some((t) => t.id === x.trackId)
      )
        throw new Error("Unknown perspective");
      editor.setState({
        playhead: x.position,
        basis,
        ...(x.trackId ? { trackId: x.trackId } : {}),
        panel: "cursor",
        inspectorOpen: true,
      });
      return {
        position: x.position,
        basis,
        trackId: editor.getState().trackId,
      };
    },
  },
];
export function registerWebMCP() {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: Tool,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  for (const tool of narrativeTools) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
