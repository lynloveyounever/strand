// Fixed stdin/stdout bridge to the exact editor domain rules. No dynamic code,
// paths, modules, network tools or shell arguments are accepted from clients.
import { readFileSync } from 'node:fs';
import { clone, editUnit, validateProject } from '../../src/model';
import { editStoryContext } from '../../src/storyAuthoring';
import { bases, reconcileTimelines, timelineChanged } from '../../src/temporal';

try {
  const raw = readFileSync(0, 'utf8');
  if (Buffer.byteLength(raw) > 8_000_000) throw new Error('Request exceeds 8 MB');
  const input = JSON.parse(raw);
  const original = validateProject(input.project);
  if (input.action === 'validate') {
    process.stdout.write(JSON.stringify({ project: original }));
  } else if (input.action === 'apply' && Array.isArray(input.operations) && input.operations.length <= 20) {
    const project = clone(original);
    for (const operation of input.operations) {
      const { op, event_id, basis, occurrence_ids, ...patch } = operation;
      if (op === 'set_story_context') {
        if (Object.keys(patch).some(k => !['title', 'premise', 'themeQuestion'].includes(k))) throw new Error('Unknown story field');
        editStoryContext(project, patch);
      } else if (op === 'edit_event') {
        if (!project.units.some(u => u.id === event_id && u.kind === 'beat')) throw new Error('Unknown event');
        if (Object.keys(patch).some(k => !['title','summary','intent','audienceEffect','turningPoint','eventType'].includes(k))) throw new Error('Unknown event field');
        editUnit(project, event_id, patch);
      } else if (op === 'reorder_timeline' && bases.includes(basis)) {
        const timeline = project.timelines[basis as keyof typeof project.timelines];
        const byId = new Map(timeline.placements.map(item => [item.id, item]));
        if (!Array.isArray(occurrence_ids) || occurrence_ids.length !== byId.size || new Set(occurrence_ids).size !== byId.size || occurrence_ids.some(id => !byId.has(id))) throw new Error('Timeline order must be an exact permutation of existing occurrence IDs');
        if (occurrence_ids.some((id, i) => id !== timeline.placements[i].id)) {
          timeline.placements = occurrence_ids.map(id => byId.get(id)!);
          timelineChanged(project, basis);
        }
      } else throw new Error('Unsupported operation');
      reconcileTimelines(project, original);
      validateProject(project);
    }
    process.stdout.write(JSON.stringify({project: validateProject(project)}));
  } else throw new Error('Unsupported bridge action');
} catch (error) {
  process.stdout.write(JSON.stringify({error: error instanceof Error ? error.message : 'Invalid project'}));
  process.exitCode = 2;
}
