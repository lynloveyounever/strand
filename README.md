# Strand

A local-first story, narrative and screenwriting workspace built with React, TypeScript, Vite and Zustand.

Strand helps you develop a story blueprint: what happens, why it happens, what it changes, character choices, information order, and intended audience understanding. It keeps three independently authored orders distinct:

- **Reality:** what happens in the story world
- **Narrative:** how events and information are presented, including flashbacks and repeated presentations
- **Audience:** authored disclosure, belief, questions, expectations and intended emotional response

New stories open in **搭建故事**, where one event is enough to begin. Scene goal, opposition, turning point and outcome are optional. Character choices, explicit after-state and theme links stay attached to the selected event. **閱讀藍圖** presents a readable outline and exports UTF-8 text; JSON remains the complete editable backup. The story reader, linked timelines, narrative lines and owner/dimension tracks support deeper comparison and arrangement. Audience curves and rule simulations represent authored intentions and explicit hypotheses, not measured or automatically predicted audience responses.

## Event-centered writing

Start with **發生什麼**; the other writing and design fields remain optional, and blank drafts still autosave. Plot memberships, explicit cause/consequence links, linked characters and exact Audience nodes stay around the selected event. Motivation sources and earlier-disclosure requirements are explicit references; the link checks show missing or unresolved dependencies without inventing causality. The last-edit view reports authored changes and affected references. Readable blueprint TXT and complete JSON backups preserve this context.

The phone layout keeps writing fields visible first with a compact scene/event picker. Sheets account for the visual viewport and safe areas, and long track lanes scroll with explicit touch targets. Browser-rendered pixels and physical devices remain unverified.

## Scope and compatibility

The product scope is story, narrative and screenwriting. Existing realization/director-stage records remain readable for backward compatibility. There is no dedicated dialogue, subtext, voice or audiovisual directing editor.

The earlier project name was Narrative Atlas. Existing JSON schemas, IDs, storage keys and import behavior are preserved. Renaming the app does not migrate browser storage between domains: export your story JSON from the old address and import it at a new address if needed.

## Run locally

Use Node.js 22.12 or newer. The reviewed source was validated on Node.js 24.

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite. The application has no backend, account credentials, analytics or external API. Project data is saved in the current browser; export JSON for a portable backup.

## Verify and build

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The build writes static assets to `dist/`. Serve that directory with a static web server. No hosting-specific configuration is required.

The source baseline passes 369 automated domain and React/DOM tests, TypeScript checks and a production build. An independent review checked mobile/desktop DOM flows and the actual exported TXT/JSON Blob contents. Pixel-level browser and physical-device QA were not completed for that baseline; automated checks do not establish visual verification.

## Source download

```sh
python3 scripts/package-source.py
```

This regenerates `public/strand-source.zip`, used by the in-app source-download link. The portable archive excludes dependencies, build output, Git history and hosting identity.

## Architecture

- `src/model.ts`, `src/temporal.ts`, `src/worldTiming.ts`: canonical story data, independent occurrence orders and explicit world-time relationships
- `src/store.ts`: transactions, undo/redo, import/export and local autosave
- `src/StoryAuthoring.tsx`, `src/storyAuthoring.ts`: progressive story-blueprint authoring and readable outline export
- `src/StoryReader.tsx`: story-first reading and focused editing
- `src/AlignedTimelines.tsx`, `src/TimelineNavigator.tsx`: linked order comparison and navigation
- `src/storyTracks.ts`, `src/StoryTracks.tsx`: owner/dimension definitions and authored state
- `src/audienceEngine.ts`, `src/audienceSimulation.ts`: deterministic audience-rule hypotheses and provenance
- `src/EventFocus.tsx`, `src/eventWorkflow.ts`: event-centered editing, explicit dependency checks and edit-impact reporting
- `src/phoneLayout.ts`, `src/phoneLayout.css`: phone viewport behavior and final responsive rules
- `src/*.test.*`: domain and React/DOM regression coverage

See [the implementation guide and revision notes](docs/implementation-guide.md) for detailed behavior, data contracts and historical verification.

## Source provenance

This portable export is based on source revision `5b6d2319d53e33967931e9f0f515040cbc13e23a`. Changes in this export are limited to Strand branding, repository documentation and source-package naming. No new license grant is added.
