# Strand · Implementation guide and revision notes

Implementation and historical revision notes for Strand (formerly Narrative Atlas). Test counts in older sections refer to their respective revisions. See the root README for the latest source and verification status.

## Optional FastAPI workspace · 2026-10-03

Strand now includes a runnable private, single-owner FastAPI backend and an opt-in **Server & assistant** panel in Project settings. Browser-local editing still works independently. Connecting never uploads, replaces or merges a story automatically. Snapshots are explicitly reviewed before sending or loading; assistant and external MCP suggestions remain pending until the owner reviews their before/after changes.

The backend provides SQLite persistence, revision conflicts, append-only history/restore, backups, three typed story operations and official Streamable HTTP MCP. A server-configured OpenAI-compatible provider is optional. No Python server, live model or Hermes connection has been deployed or configured for the existing static Site. The current Site remains private; running FastAPI requires a separate Python + Node runtime.

See [backend setup and boundaries](backend/README.md) for local/Docker instructions, server-only secrets, model compatibility, exact operation scope, backup and tests. Final checks for this slice: **405 frontend tests, 54 backend tests + 38 subtests**, TypeScript, production build, and real Uvicorn liveness/fail-closed HTTP smoke pass. Docker and browser-rendered visual QA remain unverified; the cloud browser returns `ERR_BLOCKED_BY_CLIENT`. Existing model/domain behavior and local saves are preserved.

Before publishing a source change, run `npm run package:source` and then `npm run build`. The downloadable ZIP includes the backend source and synthetic fixtures, but excludes deployment identity, credentials, databases, dependencies and generated runtime bundles.

## Save and restore reliability · 2026-10-03

This bounded completion pass preserves the current story model and interface. Closing project settings with Escape, the close button or its backdrop commits the focused writing field. Escape during active Chinese/IME composition does not commit or dismiss project settings or the inline story reader. JSON backup actions flush the focused field and read the latest committed project. A cancelled new-story action retains those edits. Legacy settings and inspector fields now invalidate their uncommitted drafts when import, undo or another project replacement occurs, even if the replacement's field value is unchanged.

JSON import keeps only the latest file selection. A slower prior read or error cannot overwrite a newer import. If the story changes while a file is loading, including a still-focused writing draft, the current work is kept and a message asks the author to select the backup again. Cancelled, malformed, incomplete, oversized and failed imports leave the story and its undo history intact. Unmounting the editor abandons its pending import.

Regression coverage includes repeated settings open/close and real JSON Blob exports at 320px and 1440px DOM sizes; a fresh two-plot story through structure reorder, cancelled and confirmed deletion, undo/redo, local save/reopen, file backup import and restoration; asynchronous import races; and storage-failure recovery. These are automated interaction/data checks, not browser-rendered pixel or physical-device verification. No new features, schema fields, external services or sample replacement behavior were added.


## Story architecture first: Strand

**搭建故事** is a progressive blueprint workspace. Creating a new story opens directly on **發生什麼／為什麼發生／造成什麼結果**. The happening field is the only required writing input; blank drafts still autosave, and a story can begin with one event and no character, theme, audience design, or custom track. Event naming/reorder and scene depth stay collapsed until requested. **構想** holds the existing project premise and optional theme question; it is not a gate before writing an event.

- Optional scene goal reuses `Unit.intent`, scene outcome reuses `Unit.storyLogic.outcome`, and the only new unit guidance is optional `craft.opposition` / `craft.turn`. There is no fixed act-count or beat formula.
- The selected event stays attached to its character choices (`Transition.reaction`), interpretation, explicit after-state and optional choice/theme relation. Opening goal, obstacle and motivation remain the existing character snapshots. Communication can be summarized in third person as an action and consequence; no dialogue, voice or audiovisual-production editor was added.
- Audience effects point to the exact independent Audience occurrence. Legacy authored cognition is preserved on first edit. Repeated nodes remain separate, modern intentional blanks remain blank, and unmapped events do not redirect to unrelated nodes. Empty effects are compact and explicitly undesigned rather than expanded into blank tracks.
- **閱讀藍圖** renders a readable structural outline and exports UTF-8 text. It includes authored scene craft, causal references, character choices/after-state, and audience cognition with provenance labels. Structure and presentation exports label their different orders, and repeated presentations remain repeated. JSON remains the complete editable backup, including notes, optional advanced tracks, temporal relationships and versions.
- Existing timeline, world-time, 2D/2.5D/3D, local-storage key, IDs, schema-v1 migration, schema-v2 files, actor/director data and immutable approval history are retained. New events are inserted near their scene without normalizing other occurrences. Exact selected repeated occurrences survive entering and leaving authoring.
- New approvals freeze the story premise/theme, character definitions/opening state, scene and event guidance, descendant choices and the existing timeline context. Edits in both new and legacy perspective/settings controls reopen the applicable blueprint; old snapshot strings remain unchanged.
- Blur commits fields. Backgrounding and page exit flush the focused field before local save. Same-ID import/undo discards stale drafts. Canceling new-story creation preserves the current project and authoring location. Fictional example preview remains read-only with respect to the user's current work.

Browser-rendered pixel QA is not claimed for this release. The current environment reports a portable execution profile; Vite starts, but the same-context readiness command fails in the sandbox launcher, and the ordinary shell namespace cannot reach that listener. No deployed private Site browser route was used as a workaround. Final verification: TypeScript and 328/328 tests pass, including 27 new authoring domain/UI scenarios. An independent review also exercised mobile/desktop DOM flows and actual exported TXT/JSON Blob contents. Domain and DOM tests cover complete blank-story authoring, optional scene/character/audience development, save/reopen/import/history, lifecycle persistence, selection handoffs and approval preservation.

## Current default: read the story first

**讀懂故事** opens the first world event, with the premise, one ordered route and the selected event’s explicitly authored cause → action → outcome. Three Chinese question tabs separate world chronology, presentation order and audience understanding; only one route is visible at a time. The cast and advanced controls are progressively disclosed.

**對照與編排** retains the three linked timeline rows for comparing exact repeated occurrences and reordering one basis. **更多工具** retains single-line semantic editing, audience curves/rules, narrative-line roles and 3D/prism views. Existing local saves and approvals are preserved. **閱讀完整示例** safely previews the revised fictional story without replacing the current project.

The full data contract and verification notes for this clarity revision are at the end of this document. Browser pixel/physical-device QA remains unavailable under the established environment restriction; DOM/source checks do not claim visual validation.

## Time-aligned content workbench

Open **時間線工作台** from the main view tabs. The story reader remains the opening view. The workbench keeps the same selected event/occurrence, playback reference, hover preview, single-line focus and fixed right-side inspector.

- Plot lines are rows on one global **Narrative presentation sequence**. A canonical event can belong to several lines; every repeated occurrence has its own column. Membership reuses existing narrative lines rather than creating independent clocks.
- Optional content tracks group **owner → dimension** inside one existing order. Names and meanings are free text. Categories include goal/desire, growth, cognition, emotion, relationships, clue/reveal, capability, resources, obstacles, judgment and custom dimensions.
- Character, character-pair, audience and custom owners are supported. Optional “about whom” and epistemic metadata distinguish authored world facts, a character’s self-belief, audience judgment about a character, and intended audience response. These do not infer ability from outcomes or private facts from beliefs.
- Categorical values are explicit state transitions. Numeric values require finite bounds and descriptions of the scale; missing values stay gaps, including valid authored zero. Clue/reveal tracks store explicit links, with no inferred causality. In partial-world mode numeric segments connect only adjacent samples whose forward order is established.
- A track can instead read existing character snapshots or exact Audience cognition/emotion fields. Narrative character bindings explicitly show the corresponding **world** state, not audience knowledge. Modern blank cognition never falls back to old text. Source bindings do not copy or overwrite derived reactions or observations.
- The fixed **追蹤** inspector creates, edits and deletes definitions and values. Source navigation opens the real source and updates focus. Unsaved drafts reset on project replacement or undo to prevent text leaking into another story. Display filters and visibility are view-only.
- Optional **2.5D 分層** and the full 3D viewer use the same occurrence selection. They retain local scroll/camera state when entering details and returning. Projection spacing is layout, never time or emotion.
- Selecting an Outline row exposes child/sibling creation, structure up/down and confirmed deletion. These actions operate on canonical structure and its corresponding Narrative block, not the currently viewed Reality/Audience occurrence order. Deletion remains undoable.

### Optional world-time relationships

Projects without `realityTiming` retain their existing ordinal semantics. **設定明確先後／同時** explicitly converts an existing project by seeding adjacent before constraints, preserving all old chronological relationships through transitivity. After conversion, horizontal positions are only saved reading/layout order; before/after/same-time comes from authored constraints. Moving a card does not rewrite those constraints.

Same-time groups are derived only from explicit same-time relations. Unconnected events have unknown relative order, not simultaneity. The validator contracts same-time groups and rejects contradictory strict order or directed cycles atomically. Removing a canonical intermediate event preserves entailed order/equality among surviving events; merely unmapping a Reality occurrence preserves its canonical facts.

World character states resolve from explicit constraints. A directly authored state can establish an event’s state; ambiguous or competing possible predecessors remain unknown, and simultaneous conflicting updates have no arbitrary winner. Unknown or multiple inherited sources cannot accidentally edit an opening-state field. Ordinal flashback checks are suppressed unless the relationship graph proves a comparison. Temporal relationships and causal links remain separate.

### Compatibility and sample

Both extensions are optional schema-v2 fields, so legacy JSON, IDs, approvals, local storage and independent Audience occurrences are preserved. No sample values are inserted into an existing project. New sample projects include clearly marked fictional definitions, such as the author-set simultaneity of Lin examining a seal while Ze deletes a threatening message, with separate presentation columns. Source-bound values are frozen into immutable approval snapshots; later edits reopen the relevant blueprint without changing old approvals.

Limits: up to 48 content tracks, 3,000 updates per track and 10,000 explicit world relations, within the existing 8 MB import and browser storage limits. Structural deletion removes directly dependent tracking entries/owners, preserves unrelated values, clears only deleted reveal targets, and is undoable. Reordered clue targets stay linked. Removing a Reality placement does not delete a canonical tracking value.

The release is covered by domain, migration, source/provenance, partial-order, import isolation, full authoring, deletion/undo, autosave, visibility and integrated 2.5D tests. Browser pixel/physical-device QA remains unverified under the existing runtime restriction; DOM checks and production builds do not claim visual validation.

## Run locally

Requires Node.js 22.12+ (validated on Node.js 24).

```
npm ci
npm run dev
```

Open the local URL printed by Vite. Production build: `npm run build`. Serve the resulting `dist/` directory with a static web server. The app uses no backend, account credentials, analytics or external API.

## Start your story

Open the project title menu and choose **New blank story** for a minimal story/act/sequence/scene/beat hierarchy. This replacement is undoable. Add perspective tracks in the Track inspector. The original sample remains available from the same menu.

## Three time bases, independent of perspective

In the optional single-timeline editor, the **Time Basis** bar changes the active event placement order. The **View as** menu changes whose state is inspected; these are separate controls.

- **Reality**: one occurrence per canonical historical event, ordered in the story world. Character state follows this order. An audience track does not acquire knowledge merely because something has happened.
- **Narrative**: presentation order, including flashbacks, flash-forwards and multiple presentations of one event. Character state is looked up at the corresponding Reality point. Audience understanding changes only through explicitly authored occurrence snapshots.
- **Audience**: independently ordered disclosure / understanding steps. A character track here represents the audience's authored model of that person, not the person's private truth. It starts unstated until authored.

Open **Time** in the inspector to compare a shared event across all three orders, move or repeat an occurrence, choose its local scene container, add a disclosure snapshot, or remove a mapping without deleting the underlying event. Canonical fact edits affect all occurrences. Changing Narrative or Audience order never changes Reality order. Every axis uses ordinal units, not clock seconds; optional context notes can supply authored dates or durations.

At wider scales, contiguous occurrences are grouped by their act/sequence/scene. A container can reappear after a time jump; noncontiguous appearances are not falsely stretched across intervening material. Timeline drag moves only the selected basis. Outline edits change canonical hierarchy and move the affected Narrative block while preserving unrelated presentation order.

### Existing projects

Schema v1 JSON and existing browser saves migrate to v2 in memory. Facts, hierarchy, event links and approval history are preserved. Each old event gets an initial mapping on all three timelines; existing audience snapshots seed Narrative and Audience independently. No story is replaced by the new sample. The original browser save is left untouched until the first authored edit; export produces v2. Use the project menu to load the optional new time-order demonstration.

### Craft guidance and sources

- [Scheffel, Weixler & Werner, “Time,” Living Handbook of Narratology](https://www-archiv.fdm.uni-hamburg.de/lhn/node/106.html): the distinction between event order and telling order informs independent placements; frequency informs repeat occurrences; duration informs optional qualitative pace labels
- [Burkhard Niederhoff, “Focalization,” Living Handbook of Narratology](https://www-archiv.fdm.uni-hamburg.de/lhn/node/18.html): restricted information motivates separating character truth from audience understanding
- [University of Toronto, Drama key terms](https://cpercy.artsci.utoronto.ca/courses/220KeyTermsDefinitions.htm): objective, obstacle and action inform optional beat-level questions

The independent Audience timeline is this application's design inference, not a standard third axis claimed by those references. Craft questions are optional. Structural diagnostics flag missing mappings and conflicts between explicit labels and mapped order; they do not infer motivation, assess prose or judge story quality. Omissions may be intentional. Pace is qualitative and does not alter measured duration. There is no mandatory three-act formula.

## The working model

- **Story → Act → Sequence → Scene → Beat** is a real hierarchy. Drag like units in the outline or timeline to reorder them, including entire acts/scenes. Use Earlier/Later buttons or the Container field for keyboard/touch alternatives. Every branch retains at least one child; adding a higher-level container creates a minimal child chain.
- **Semantic zoom** selects actual entity levels: Story (acts and major turns), Sequences, Scenes and Beats. It is not a CSS magnification of the same cards. Higher-level ranges derive from their descendant beats. Container bands preserve visible ownership.
- **Each active time basis** aligns objective-event occurrences, characters and audience tracks on one axis. A beat is stored once. Perspective links point to its stable id, retaining interpretations, reactions and after-states when it moves.
- **Arcs** are authored state changes along a perspective lane, and can span any number of acts/scenes. Coarse cards aggregate the state entering and leaving their range; close views reveal linked evidence and individual reactions.
- **Position** is measured in narrative units, not film seconds. Beat i occupies `[i, i+1]`; its change occurs at `i+0.5`. Before the first linked change, the initial state applies. At arbitrary cursor positions, snapshots follow the active time basis as described above. No motives or knowledge are inferred.
- **Role switching** shows authored knowledge, goal, obstacle, driving need and state at the cursor. Author view compares drives and shows the current event's narrative intention/audience effect. The event inspector compares before → interpretation → reaction → after for linked perspectives.
- **Creation stage** is a separate axis: Writer blueprint, Actor realization, Director realization. Each unit has revisioned notes, draft/review/approved state and explicit review/approval controls. Realizations reference a blueprint revision. Approved snapshots are retained when new edits reopen the draft. Changes to parent/child blueprint context or story order invalidate relevant current revisions; previous approved snapshots remain unchanged. Link a realization to the current blueprint before requesting review again.
- Approval is a local user decision, not a verified team identity, legal signature or external production signoff.

## Persistence and exchange

Edits autosave to this browser's localStorage, with a schema version and validation on load. This is device-local storage, not cloud synchronization. Save failure is surfaced. An unreadable existing save is not overwritten until an authored edit occurs.

Export JSON to back up or move a project to another browser. Import validates file size, structure, ids, hierarchy, perspective links, snapshots and revisions before replacing the current project. Import is undoable. Undo/redo retain up to 80 prior project snapshots in the current session; this history is not persisted between reloads. Approved snapshots are persisted in project JSON.

Limits: 1,000 canonical units; 3,000 occurrences per timeline; 24 perspective tracks; 8 MB import files; browser storage quota still applies. All content is rendered as text. Export before clearing browser data.

## Interaction

- Drag empty canvas with a mouse to pan; Shift + wheel pans horizontally
- Ctrl/Command + wheel changes semantic zoom
- Touch drag pans; two-finger pinch zooms; labeled scale buttons and sliders provide alternatives
- Drag like units to reorder; use Container and Earlier/Later for accessible moves
- Ctrl/Command + Z undoes; Ctrl/Command + Shift + Z or Ctrl + Y redoes
- Inspector fields commit when focus leaves the field
- Escape closes project/help dialogs; dialog keyboard focus is contained

## Phone workspace

At widths up to 760 px, the timeline occupies the workspace instead of competing with side columns. Structure and Details open full-width sheets with a **Done** button; dismissing them preserves the timeline position. Focused editor fields save before dismissal, including Escape. Background controls are inert while a sheet is open, and keyboard focus stays in that sheet.

- Tap a timeline card for details; swipe over cards to pan without selecting or reordering them
- Use Story / Sequences / Scenes / Beats for touch-size semantic zoom, or pinch
- Reality / Narrative / Audience remain directly available; **Compare** opens the Time inspector
- View as focuses one perspective plus the shared event row; Author shows every track
- **Locate cursor** recenters the timeline without opening a panel
- The bottom dock opens Structure, Details, Project and Help
- Project contains Import JSON, Export JSON, story settings and sample/blank-story controls
- Use Earlier / Later and Container controls to reorder on a phone; desktop drag behavior is preserved

Phone text fields use 16 px type to avoid automatic focus zoom, main touch controls are at least 44 px, and sheets/dock account for device safe areas. Data remains in the same browser storage key and schema; this layout update does not reset projects.

## Holographic narrative view

The spatial atlas is an optional view, opened with ◈ from the default three-lane 2D workspace. It is a visual view of the same local project, with no schema migration or new external service.

- **Story / Sequences / Scenes / Beats** select actual semantic entities
- **Expand entities / Project to timelines** animate a separate compression parameter: canonical hierarchy positions move into Reality, Narrative and Audience occurrence order; entity height collapses onto timeline rails
- Translucent act/scene frames preserve grouping; white dotted connections show shared identity across different appearances. Repeated occurrences retain separate IDs and selectable positions
- Select an entity, then **Edit selected entity** to open the existing editor. Missing mappings remain explicitly unmapped
- **View as** isolates a perspective; colored paths show authored state changes using the existing basis-aware state rules. Author view displays the first four perspectives when more exist. Audience states are never shown as a Reality clock
- Drag to orbit; select **Pan** or use two fingers to move; pinch or use camera +/− to zoom. These camera controls do not alter semantic zoom, timeline order, or story data
- Keyboard: focus the map, use arrow keys to orbit, +/− to zoom and Home to reset; entity nodes support Enter/Space. The entity list provides a flat, keyboard-friendly alternative
- **Focus selection** and **Reset view** are inside the camera-tools menu; **2D editor** switches to arrangement editing. Reduced-motion preferences make compression changes immediate

The renderer uses real perspective-projected 3D coordinates drawn as SVG, so it does not depend on WebGL/GPU support. Axes are ordinal positions, not timestamps or durations. Entity height and perspective offsets are layout, not invented emotion/intensity scores. It remains a viewer; editing, imports, exports, undo/redo and storage use the existing editor.

## Sample

“霧港末班船” is an original suspense story with 3 acts, 4 sequences, 8 scenes, 16 shared beats, two character perspectives and one audience perspective. The time-order demo has 16 Reality events, 17 Narrative appearances (a cold open plus a return to that moment), and 7 Audience understanding steps, including a repeated light clue with a changed interpretation. The warehouse light and hidden memory card demonstrate foreshadowing, mistaken belief, reinterpretation and differentiated reactions.

## Architecture

- `src/model.ts`: hierarchy, state-at-position, shared links, semantic projection, validation and approval operations
- `src/temporal.ts`: independent occurrence orders, safe v1 migration, basis-aware state, segmented container projection and deterministic diagnostics
- `src/store.ts`: Zustand state, transactional edits, undo/redo and guarded local autosave
- `src/App.tsx`: timeline, structure outline, cursor/role view and editors
- `src/Hologram.tsx` and `src/hologram.ts`: perspective renderer, camera controls and identity-preserving timeline compression
- `src/sample.ts`: original sample project
- `src/webmcp.ts`: optional feature-detected page tools to read and navigate the same application state
- `src/*.test.*`: domain and React DOM integration tests

## Verification

```
npm run typecheck
npm test
npm run build
```

Domain and React DOM tests cover hierarchy, actual semantic levels, continuous states, shared references, reordering, safe import, local save, undo/redo, role switching, stage approval and stale references, migration without reset, repeated occurrences, independent chronology, audience knowledge boundaries, mappings and mobile control availability. All 73 tests pass, including sheet switching, focused-field dismissal and persistence, perspective filtering, pinch and swipe event handling, touch reorder/undo, and restoration of desktop panes. WebMCP registration/valid and invalid inputs are tested with a DOM registry stub; a real supported browser WebMCP context was unavailable.

The production build is verified. Full screenshot-based browser and physical touch QA were unavailable in the build environment because of its browser/socket access restrictions. DOM integration tests are not a substitute for visual QA. No access restriction was bypassed.

## Source bundle

This ZIP contains the application source, package lock and guide. Dependencies, build output, hosting credentials and live Site identity are deliberately excluded. It can be built and hosted independently.

### Phone focus workspace
The optional single-timeline editor uses a dedicated single-perspective card view at beat detail on phones up to 760px; the current default remains the three-lane 2D workspace. Native horizontal swipe snapping, Previous/Next and a full-list jump control navigate without dragging or editing the story. Time basis, detail level and perspective are native selects. The compact minimap shows the selected span; Edit opens the full-width editor. Move earlier/later reorders the focused occurrence or entire visible container on the current axis, through the same undoable transactions and approval invalidation rules as desktop. The 3D overview remains optional. Desktop retains its multi-track canvas.

Phone regression coverage includes basis/detail/POV switching, native scroll selection, card navigation, full-width editing, repeated occurrences, whole-container reorder, unchanged other axes, undo, autosave and 3D preservation. Browser pixel and physical-phone QA were unavailable in this execution environment; DOM behavior and responsive-source checks are not a substitute for device testing.

## Earlier 3D visual workspace (retained as an optional view)

The opening workspace is geometry, not a feed: event nodes, translucent Act/Scene grouping, three depth-separated axes, colored authored state paths and selected shared-identity links. The phone maps these axes into three vertical spatial lanes. Text is limited to short node labels, axis names and the selection bar. Full text remains available from Selection details or Edit selected entity; panels start closed. Camera tools and Connections & navigation start collapsed. Compression remains separate from semantic zoom. The projection endpoints have accessible names and tooltips.

Previous/Next entity controls provide 44px touch and keyboard targets without changing story data or opening an editor. Expand Connections & navigation for occurrence mapping, state provenance, explicit reorder controls and the accessible entity list. Focus cards remain an optional phone reading mode; desktop 2D uses short blocks and colored state markers rather than repeated prose. Data, approvals, storage, undo and the independent timelines are unchanged.

Validation: 73 domain and DOM tests, TypeScript and production build pass. Tests cover the new default on 390px and 1440px layouts, closed detail surfaces, geometric Act/Scene frames, selection navigation, and axis-isolated reorder/undo. Browser screenshot QA remains unavailable under the previously established environment restrictions; these checks do not claim device/pixel verification.

## Audience experience design

Choose **觀眾體驗 · 情緒／認知／預期** to open the visual audience score. Emotion curves (curiosity, tension, trust, sadness and relief) can overlap; 0–100 means authored intensity, not a measured probability. Blank values remain gaps, never inferred zeros. Each audience occurrence, including repeated presentations of one canonical event, has independent knows / believes / questions and supporting clue links. Expectation ribbons distinguish prediction from hope and fear; explicitly link a later occurrence where an expectation is realized, delayed or subverted. Editing is on demand. Return to the spatial atlas preserves the chosen audience occurrence and canonical event highlight.

The built-in example is labeled as authored sample data. No character's private truth is automatically copied into these designs. Screening observations are a separate, source-required list, never synthesized from the curves. Recording an observation does not reopen blueprint approvals. Draft feedback resets when changing occurrence and survives a rejected save.

New fields are optional additions to schema v2: existing v1/v2 projects, original save keys, approvals and approval snapshots remain valid. Audience designs and observations use normal local autosave, JSON import/export and undo/redo. Deleted supporting links are removed; a response occurrence deleted or moved before its originating expectation resets that expectation to open. Previous states remain recoverable with Undo. Sample data is only in the demo, never backfilled into imported or saved stories.

The score scrolls horizontally on phones with 44px point controls and stacked detail cards. 86 passing domain and DOM tests cover data validation, repeated occurrence independence, links and chronology, approval preservation, feedback separation, migration, undo/redo, phone control interaction and local persistence. Full browser screenshot/physical-device QA remains blocked by the established execution environment restrictions.

## Narrative lines and scoped roles

Open **敘事線** in the atlas or inspector. A narrative line is a stable identity with a title, color and explicitly chosen canonical events. It is separate from character/audience perspective tracks. Creating a line includes the currently selected unit's beats; its membership remains editable.

Each role setting explicitly identifies **Reality, Narrative or Audience** and one scope: the whole line, a hierarchy unit (Act / Sequence / Scene / Beat), or a custom inclusive interval between two stable occurrence IDs. On a phone, tap the start occurrence, then the end; neither dragging nor tiny handles is required. Repeated presentations of the same event are listed separately, including their occurrence IDs.

**Main/sub** and **overt/covert** are independent dimensions. Line color and identity stay fixed; stroke weight represents main/sub, solid/dashed strokes represent overt/covert, dots mean unspecified, and diamonds mark role changes. Only the selected line is emphasized in the spatial atlas; all lines remain accessible through the compact line shelf. Select a segment for details. These roles do not alter truth, disclosure metadata, knowledge snapshots, audience-experience design, or causal relationships.

Resolution is deterministic per occurrence and per dimension: custom interval > deepest matching hierarchy unit > whole-line setting. `unspecified` means no claim, so a lower-priority setting may supply that dimension. Identical claims agree; contradictory claims at the highest priority are shown as a conflict, never silently resolved by array order. Imported or newly overlapping conflicts stay visible for repair.

- Intervals mean the positions currently **between the two anchor occurrences, including both ends**. Reordering may change which occurrences lie between them. Reversing the anchors is safe; anchor IDs do not change
- Unit scopes follow the occurrence's placement container and its ancestry, so two presentations of one event in different scenes can differ
- Deleting a boundary or scoped unit suspends that setting with a visible warning. No endpoint is guessed or extended; edit the setting to repair it, or undo the deletion. Valid outer settings may still apply
- Boundaries may lie outside the line's event membership. Removing a member does not rewrite a valid interval. Deleted canonical events are removed from membership
- Optional `narrativeLines` data is preserved in schema-v2 JSON, autosave, import and undo/redo. Old stories and new blank stories receive no inferred lines or roles. Labeled examples exist only in the timeline demonstration
- Line edits reopen blueprint revisions while preserving existing approval snapshots. New approval snapshots include the relevant authored line context

## Selected-entity prism and reading angles

Selecting an entity highlights one canonical source and its individual projections onto the three time planes. The same event can have multiple occurrence projections. Fine dotted beams denote shared identity; **only the timeline-order rails have arrowheads**. Neither projection beams nor line membership imply causality. The spatial layout uses categorical separation, not inferred emotional, truth or narrative-quality scores.

The **Reality / Narrative / Audience** reading-angle buttons smoothly refocus the same spatial structure and emphasize the corresponding plane. Selection, exact occurrence, active editing time basis and playhead are preserved. **自由** returns to free reading; manual orbit/pan, zoom, focus and reset cancel an in-flight preset transition. Reduced-motion preferences use an immediate transition.

The three presets share validated view definitions in `src/views.ts`: content, occurrence-order / time-basis / hierarchy dimensions, line encodings, current semantic detail and bounded camera settings. This release provides the preset foundation, not a user-facing arbitrary-axis editor. The planes keep their independently authored orders; it does not claim that three arbitrary orders can be recovered as exact orthogonal projections of a single shared point.

### Verification for this update

Targeted automated coverage includes migration, independent role dimensions and axes, inclusive/reversed/reordered anchors, deleted endpoints/units, repeated occurrences, explicit overlap conflicts, approval history, persistence/import/undo, touch range selection and cancellation, gesture suppression, role rendering, one-to-many prism correspondence, finite preset validation, camera cancellation and reduced motion. Browser pixel verification is not claimed: the available local preview/browser route was blocked by the execution environment's loopback and Chromium sandbox/socket restrictions. The production Site was not used as a browser-QA workaround.

## Audience rule-engine skeleton

Open **觀眾體驗 → 規則模擬**. The authoring model is deterministic and local; its adjustable weights are hypotheses, not empirically calibrated audience probabilities or emotional predictions. Author intentions, simulated output and actual screening observations remain three separate records. No external model/API/key is used.

- Configure explicit initial knowledge (true/false/unknown) and belief scores (0–1/unknown), then attach registered rules to exact **Audience occurrence IDs**. Repeated presentations of one canonical event can have different rules. Text intentions are never inferred into executable rules
- Five initial expectation primitives: `expectation.establish`, `expectation.reinforce`, `expectation.delay`, `expectation.fulfill`, `expectation.subvert`. `knowledge.reveal` and `belief.adjust` provide explicit state inputs for conditions. Missing expectations or beliefs are unknown, never silently initialized to zero
- Execution order: Audience occurrence order; optional explicit decay at each interval; then numeric rule order and ASCII rule ID. Conditions read the state produced by preceding actions. Rules expose applied, disabled, inapplicable, unknown, unregistered, conflict and out-of-scope outcomes
- Numeric actions use amount × weight (weight 0–2), optional configured headroom saturation, then a recorded 0–1 clamp. Categorical actions use zero weight as disabled and positive weight as enabled; magnitude does not scale a category. Negative amounts are supported only for belief adjustment. Decay is opt-in and multiplicative per occurrence interval, never seconds; resolved expectations stop decaying
- Inclusive range endpoints are occurrence IDs. Missing or reversed ranges remain unresolved and require repair; they are never silently swapped. Range is an applicability guard for the rule's exact occurrence, not a repetition instruction. Same-target ordered writes accumulate; exclusive writes block later collisions visibly, including contradictory terminal actions
- Every trace retains rule parameters/source, exact occurrence/canonical event, condition reads, before/after values, requested/effective numeric deltas and clamp flags. Unknown/unregistered/conflicting effects mark the whole result incomplete. Baseline comparison refuses numerical differences for incomplete results or absent expectations
- Director moves are explicit mappings selected by the author. They retain event ID and director revision; edits to that realization suspend the mapping until it is reviewed/relinked. The future `RuleProposalProvider` interface only returns proposed rules. `acceptRuleProposal` requires an explicit acceptance decision before adding them; no adapter or network call is installed
- **重新運算** captures a reproducible input snapshot. Current configuration/context changes mark it stale; stale charts are hidden until recomputation. **保存為比較基準** stores the current run input. A version-tagged engine replays saved inputs rather than trusting persisted output. Old engine versions remain stored but require recomputation
- Optional schema-v2 `audienceEngine` stores config, last-run input and baseline input. Old schema-v1/v2 stories receive no inferred engine configuration. Local autosave, JSON import/export, undo/redo preserve it. Rule edits reopen blueprint revisions; existing approval history remains immutable and new approvals include exact engine config. Running/saving a baseline or entering screening feedback does not reopen approvals

Implementation: `src/audienceEngine.ts` (typed registry, evaluator, trace and proposal boundary), `src/audienceSimulation.ts` (project/persistence bridge), `src/AudienceRuleEngine.tsx` + `src/audienceEngine.css` (visual-first editor). Register another pure rule with typed actions, update the engine version when semantics change, and add regression cases. No arbitrary code from imported projects is executed.

Verification for the engine release: 135 automated tests pass, including 22 engine/domain cases and three end-to-end React interaction cases; TypeScript and production build pass. Tests cover order, unknown conditions, conflicts, weights/clamps, range repair, prototype-key safety, immutable unique traces, decay order, source staleness, proposals, approval preservation, replay/baseline, persistence, import and undo. The earlier environment limitation still prevents browser pixel QA; no production-browser workaround was used.

## Story-first reading workspace (October 2 clarity revision)

The default is now **讀懂故事**, beginning with the first event in the story-world order. A compact premise and expandable cast orient the reader. Three purpose-labeled reading routes show only one order at a time:

- **故事怎麼發生**: canonical actions, explicitly authored cause / action / outcome, character goal / motivation / interpretation / reaction, and before/after authored state
- **觀眾怎麼看到**: exact presentation notes and disclosure, including independent cold openings, flashbacks and repeats; world facts are collapsed and labeled author-only
- **觀眾怎麼理解**: exact occurrence-level knows / believes / questions and expected payoffs, with planned later responses distinguished from a response occurring now. Legacy authored audience updates remain readable. An explicitly blank modern design is not overwritten by legacy fallback

The ordered route includes action sentences instead of title-only nodes. Scene summaries appear only on the world route; presentation/understanding containers are labeled as such and never asserted to be an event's actual location. Narrative line filters are optional and preserve full-order numbering. The phone route collapses after selection; the selected event remains the main work surface. **對照與編排** retains linked three-order correspondence and reorder controls. **更多工具** organizes single-line editing, audience curves/rules, line roles and 3D/prism views.

Optional `Unit.storyLogic` stores authored `cause`, `outcome` and optional canonical `causeEventId`. No cause or consequence is inferred from adjacency, line membership, numeric metrics or existing prose. Missing information is explicit. These fields validate, autosave, import/export, undo/redo, invalidate blueprint reviews and are included in new immutable approval snapshots. Deleting the referenced source event removes only the dangling reference, retaining authored prose. Existing approval snapshots remain unchanged.

The revised fictional sample has distinct scene summaries and explicit causal writing. It connects the supposedly stolen cargo seal to the pollution evidence, explains escape through the side door before the broadcast, and labels the final new tickets as occurring after investigation. Existing saved/imported stories are never rewritten or filled with this content. **閱讀完整示例** opens a read-only in-memory sample without importing, autosaving, replacing history or moving the user's current selection; **回到我的作品** returns to the original project. Explicit load-sample remains a separate confirmed action under Project settings.

Verification: all 169 automated domain/DOM cases passed, including 24 added comprehension/data-preservation cases. Tests assert default single-route layout at 390px/1440px, readable e8 cause/action/outcome, exact repeated presentation edits, audience fallback and explicit blanks, future payoff timing, approval invalidation/snapshots, unmapped-action guards, and read-only sample isolation. TypeScript and build are checked during publication. These checks do not establish pixel-level/physical-device appearance. Browser visual QA remains blocked by the unchanged local-loopback and Chromium sandbox/socket restrictions; production is not used as a workaround.

## Reader-to-editor polish (October 2 continuation)

Small edit links beside cause, action, outcome, presentation, audience understanding and the selected character open the matching field directly. Done or Escape commits the focused field, keeps the exact occurrence and selected character, restores the reading scroll position, and returns keyboard focus. Repeated edit links retain the original return position. Import or Undo discards an unsaved old field draft instead of writing it into a replaced project.

The collapsed **這一步尚未寫下** list reports only empty text for the current occurrence and linked selected character. It is an optional writing aid, not a story-quality score or mandatory checklist. Whitespace is empty; optional cause references and unlinked characters are not counted. Presentation-specific missing text is distinguished from a displayed canonical-summary fallback. The existing schema has no intentional-blank marker, so the interface explicitly acknowledges that a blank may be deliberate rather than inventing that distinction.

Character motivation editing shows whether the displayed value comes from the opening state or a prior event. Saving edits that exact source snapshot, never the current event's after-state by mistake. It conservatively reopens current blueprint revisions because later readings may inherit it, while preserving approval snapshots. Interpretation and reaction remain on the selected current event; an unlinked character is linked only when writing is actually saved. No schema fields, automatic stories, external services or inferred causality were added.

The complete sample remains read-only. Its **回到我的作品編輯** control returns to the original project without copying sample data. The advanced editors remain under progressive disclosure.

Verification for this polish: all 185 automated domain/DOM tests, TypeScript and production build pass. Added cases cover source-aware motivation, explicit blank snapshots, reordered and stale sources, approval history, undo/redo, no-op character linking, optional gap categories, exact-repeat edits, Done/Escape commits, scroll/focus restoration at 390px and 1440px, same-ID imports and sample isolation. Browser pixel/physical-device QA is still not claimed due to the established runtime restrictions; the live Site was not used as a browser-QA workaround.

## Audience curve visibility clarification (October 2)

The Audience design chart now names the current project and reports authored point/segment counts for each emotion. Empty older stories explicitly explain why there are no curves; isolated values remain visible as points. Two adjacent Audience occurrences need an authored value for the **same emotion** to form a segment. Missing values stay blank rather than becoming zero or being interpolated; the chart retains separate repeated occurrences. Expectation ribbons have their own count or empty message.

**查看完整曲線示例** opens a read-only, in-memory chart of the existing complete fictional sample: 21 authored emotion segments and 3 expectation ribbons. Browsing its nodes, support links and ribbons never imports data or changes the working project, exact selection, undo/redo history or autosaved content. **回到我的作品** restores the working chart. Sample editing, rule execution and feedback entry are unavailable in this preview. No old story receives invented emotional values.

Verification: 191 automated domain/DOM tests pass, together with TypeScript and production build. Added coverage includes empty/zero/single/gapped/adjacent emotion values and preview isolation at 390px and 1440px. These checks do not establish pixel appearance; the existing browser loopback/sandbox restrictions remain, and the published Site was not used for browser QA.

## Refined workbench · 2026-10-02

- Neutral graphite chrome and compact, square-edged widget frames. The central timeline toolbar, active-order controls and canvas are contained together; outline and inspector are separately framed.
- Tool navigation distinguishes time views (replace the central workspace) from structure/relationship tools (open a sidebar). Contextual tabs live in the inspector. The selected event, its kind and active occurrence/order remain visible above those tabs.
- Five drawn semantic icons replace ambiguous Story / Act / Sequence / Scene / Beat initials, with accessible names and an on-demand hierarchy key. Custom narrative-line names are preserved; role legends are visually noninteractive.
- Story reading retains the authored cause/action/outcome, character and audience semantics. Typography and open relationship rails distinguish section context, event headlines, body text and metadata; inline edit affordances are compact pencils with exact field labels.
- Audience design omits the graph entirely when no authored values exist. The event rail and an explicit authoring action remain visible. Real charts have bounded height, preserve isolated points and gaps, and align with occurrence positions. Selected emotion readouts show only authored values, including zero.
- The 3D camera rotates continuously horizontally and vertically, wrapping angles rather than clamping them. Reset, prescribed reading views, pan/zoom and selection remain unchanged. Preset transitions take the shortest angular path. A filled node marks the active occurrence; outlined related nodes mark other positions of the same story element. The source is named as the shared story element, not an unexplained “original entity.”
- Browser pixel and physical-device verification remain unavailable due to the previously established execution restriction. These changes were checked through TypeScript, React interaction/data regressions, static layout review and the production build. No screenshot verification is claimed. A new single-axis drill-down/back journey is not part of this revision.

## Three-line overview and chosen-line reading · 2026-10-02

The main **讀懂故事** workspace is unchanged. The separate **三線總覽** view starts with one compact row per order and no automatically opened detail line. Moving a mouse across a row temporarily previews the nearest exact occurrence and emphasizes related event nodes; leaving restores the reference view. Keyboard focus/arrows offer the same preview and Enter opens that exact node. Phones use scrollable 44px node targets, tapping and a presentation-step scrubber. Clicking a node opens an actual single-line event rail with readable authored content and, for Audience, the existing adjacent-only authored emotion series. Reality and Narrative do not receive fabricated emotion values. Back/Escape restores the prior exact inspection selection, reference step, camera, scroll and keyboard origin; playback pauses while reading details.

Playback is explicitly **Narrative presentation progression**, addressed by stable occurrence IDs. It is not elapsed story time. The speed setting is UI reading cadence. The Reality summary resolves the current event's world-order location and its authored character state. The Narrative summary uses the exact presentation, including repeats. Audience playback state comes only from the latest whole audience-track snapshot explicitly authored on Narrative, or the authored opening state; blanks remain blank. Each summary retains source provenance. Independent Audience design nodes are identity correspondences, not automatically reached disclosures. Missing and multiple correspondences stay visible and no first-match timing assumption is made. Exact Audience previews use modern authored cognition when present, including intentional blank strings.

The optional expandable spatial projection retains independent camera editing and shows a separate exact playback-reference diamond plus correspondence markers. Camera zoom and order/semantic-scale controls live inside that projection; they do not imply changes to the compact overview. Project changes pause playback. Deleted reference nodes remain unset until explicitly selected, and focused/return positions follow stable IDs after reorder rather than stale array indices.

View switches now live in the navigation bar. Left/right sidebar launchers sit at the workspace edges; the mixed **更多工具** umbrella is removed. Controls to edit the currently focused node open its inspector without replacing the reading context. Content-sized spacing and restrained titles keep the approved graphite palette and clear square widget boundaries.

### Display corrections and structural context

- The single-line editor's lower categorical tracks again show their authored state, known update count or carry-forward label, track purpose, and visible markers. A legacy hide rule had suppressed all state text. Carried state is not an inferred emotion measurement and an unselected perspective is explicitly de-emphasized.
- Outline disclosure uses one stable SVG chevron cell, explicit expansion state, fixed top alignment, stable scrollbar gutter, bounded long-title wrapping and viewport anchoring. Expanding children does not change the icon's own column.
- Noncontiguous representations of the same container are labeled **第 1/2 段**, **第 2/2 段** when needed; they are not merged and the underlying ordering is not rewritten.
- Act/Sequence/Scene is treated visually as presentation structure. The comparison displays structure bands only on Narrative. In the single-line editor, Reality and Audience structure affiliation is separately disclosed as optional context, not an inherent unit of their clocks. Shared hierarchy and saved schemas are unchanged.

The browser pixel/device QA restriction remains unchanged. Verification uses pure semantic tests, React/DOM interaction regressions, targeted CSS visibility checks, source-layout review, TypeScript and the production build. No screenshot verification or inspection of a user's browser-local story is claimed. No new owner/dimension track registry is included in this revision.

Final regression count for this revision: 222 automated tests.

## Phone layout audit · 2026-10-02

The phone pass now has a final, explicit responsive layer loaded after all feature and theme styles. It fixes a specificity conflict that left the structure/details sheets beneath their backdrop, gives those sheets visual-viewport-aware height and safe-area bounds, and keeps the close control reachable with short/keyboard viewports. Rotated coarse-pointer phones retain the phone workspace instead of switching to desktop sidebars.

The story builder starts with its three writing fields and a compact, expandable scene/event picker. Choosing or adding a scene collapses the picker and preserves exact event selection. Character reading sections remain one column; long 2.5D and single-line titles wrap within their own cards. The overview heading wraps its spatial controls. Sidebar launchers, inspector tabs and structure disclosure targets have explicit phone touch bounds. Content-track state and numeric lanes scroll horizontally with 44px occurrence targets, while numeric points and targets share the same inner width. Track visibility and camera tools expand inside their owning panels rather than extending outside a short viewport.

Source-cascade and DOM regression coverage includes 320, 360, 390 and 430px phone widths, 844×390 coarse-pointer landscape, visual viewport keyboard resizing, pinch-zoom preservation, panel open/dismiss/Escape, scene selection/creation, and 14/40/300-occurrence target sizing. Numeric markers and strokes retain screen-space sizes as the lane grows. These tests inspect actual stylesheet order, selector priority and interaction behavior; they do not measure rendered browser pixels. The local development server starts, but the same-context preview request still fails in the execution runtime before reaching the server. No physical-phone or screenshot pass is claimed, and the live private Site was not used to bypass that restriction.

## Event-centered refinement · 2026-10-03

The existing **搭建故事** workspace now keeps the optional work around the selected event. Start with **發生什麼**; it is the only required writing field. Blank drafts still autosave safely, and cause, outcome, characters, plot membership and audience design remain optional. The default **讀懂故事** view and independent order semantics are preserved.

- Event cards show all explicit plot memberships. The selected event's authored cause and direct consequences remain highlighted; unrelated context is visually dimmed but available. Cause arrows only use the existing `storyLogic.causeEventId`, never proximity or shared membership. The event-local plot controls reuse `NarrativeLine.eventIds`; scoped roles and owner/dimension content tracks are unchanged.
- A bounded three-column comparison keeps the world event, linked characters' saved knowledge/desire, and exact corresponding Audience nodes together. Phone layouts stack this comparison and retain previous/next event controls with the current structural position. Canonical character links stay visible even when world placement is absent or world state is unresolved; conflict and unmapped provenance are explicit.
- The current character editor and exact Audience-node cognition fields now unfold inside the event workspace. Expectations, response links, authored emotion values and Audience-node ordering are also editable there. Repeated occurrences remain distinct. Missing emotion is unknown; authored zero remains zero. No values are predictions of real people's responses.
- Optional `Transition.motivationSource` stores an explicitly chosen opening-state or prior-event motivation dependency. It is not inferred from having a reaction. Removing the motivation, changing world provenance, or clearing the choice produces a traceable warning/unknown state. Existing dependencies remain removable even after a source or choice is missing.
- Optional `AudienceDesign.requiredEarlierIds` stores explicit prior-disclosure requirements between exact Audience occurrence IDs. It is separate from ordinary evidence `supportIds`. Missing sources are preserved for repair rather than silently retargeted. Reordering an independent axis does not imply that another axis reached the same event.
- **連結檢查** shows the actual source and what is established, missing or unresolved. **上一步修改的影響** compares the last saved edit, including explicit check changes, order changes, character before-state provenance and expectation-response resets. It does not infer psychological plausibility, causality from prose, or overall story quality.
- Full JSON backups, local autosave, undo/redo and immutable approval history preserve the new optional fields. Readable blueprint exports include plot membership, motivation-source references, disclosure requirements and authored expectations. No user story is replaced by a demonstration.

Verification includes a complete fresh two-plot story through writing, plot creation, character choice, explicit motivation/reveal checks, Audience reorder, undo/redo, local save/reopen and actual TXT/JSON Blob export at desktop and phone DOM sizes. Independent code review found and resolved empty-choice unlinking, stale source captions and conflicting/unmapped character readouts. TypeScript, deterministic domain and React/DOM tests, and production compilation are checked on the final source. Browser-rendered pixels and physical phones remain unverified: Vite starts, but the required same-context preview readiness check fails in the execution runtime before reaching the server (`bwrap` mount error). The private production Site was not used to bypass that restriction.
