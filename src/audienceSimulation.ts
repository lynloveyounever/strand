import { clone, updateBlueprint, type Project } from './model';
import { ENGINE_VERSION, emptyEngineConfig, evaluateAudience, validateEngineConfig, type EngineConfig, type EngineInput } from './audienceEngine';
export type SavedSimulation = { engineVersion: string; input: EngineInput };
export type AudienceEngineProject = { config: EngineConfig; lastRun?: SavedSimulation; baseline?: SavedSimulation };
export function engineConfig(p: Project): EngineConfig { return p.audienceEngine?.config ?? emptyEngineConfig(); }
export function engineInput(p: Project): EngineInput {
  return {
    config: clone(engineConfig(p)),
    occurrences: p.timelines.audience.placements.map(o=>({id:o.id,eventId:o.eventId,title:p.units.find(u=>u.id===o.eventId)!.title,directorRevision:p.units.find(u=>u.id===o.eventId)!.stages.director.revision})),
    // Intent/context is retained for provenance and staleness, never converted to effects by text inference.
    context: p.timelines.audience.placements.map(o=>({id:o.id,note:o.note,knowledgeNote:o.knowledgeNote,design:clone(o.audienceDesign??null),event:p.units.filter(u=>u.id===o.eventId).map(u=>({id:u.id,summary:u.summary,intent:u.intent,audienceEffect:u.audienceEffect,director:u.stages.director.text}))})),
  };
}
export function configureEngine(p: Project, change: (config: EngineConfig)=>void) {
  const previous=engineConfig(p), next=clone(previous);
  change(next);
  validateEngineConfig(next);
  if(JSON.stringify(next)===JSON.stringify(previous))return;
  p.audienceEngine ??= { config: emptyEngineConfig() };
  p.audienceEngine.config=next;
  updateBlueprint(p,p.units.find(u=>u.kind==='story')!.id);
}
export function runSimulation(p: Project) {
  p.audienceEngine ??= {config: emptyEngineConfig()};
  const input=engineInput(p);evaluateAudience(input);
  p.audienceEngine.lastRun={engineVersion:ENGINE_VERSION,input};
}
export function saveSimulationBaseline(p: Project) {
  if(!p.audienceEngine?.lastRun)throw new Error('Run the simulation before saving a baseline.');
  p.audienceEngine.baseline=clone(p.audienceEngine.lastRun);
}
export function replaySimulation(saved: SavedSimulation | undefined) {
  return saved?.engineVersion===ENGINE_VERSION ? evaluateAudience(saved.input) : null;
}
export function validateAudienceEngine(p: Project) {
  if(p.audienceEngine===undefined)return;
  const value=p.audienceEngine;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid audience engine');
  validateEngineConfig(value.config);
  for(const saved of [value.lastRun,value.baseline])if(saved!==undefined){
    if(!saved||typeof saved!=='object'||typeof saved.engineVersion!=='string'||!saved.input||typeof saved.input!=='object'||!Array.isArray(saved.input.occurrences)||saved.input.occurrences.length>3000)throw new Error('Invalid saved audience simulation');
    validateEngineConfig(saved.input.config);
    const ids=new Set<string>();
    for(const o of saved.input.occurrences){if(!o||typeof o.id!=='string'||typeof o.eventId!=='string'||['__proto__','constructor','prototype'].includes(o.id)||['__proto__','constructor','prototype'].includes(o.eventId)||!/^[-a-zA-Z0-9_]{1,100}$/.test(o.id)||ids.has(o.id)||!/^[-a-zA-Z0-9_]{1,100}$/.test(o.eventId)||typeof o.title!=='string'||o.title.length>20000||!Number.isInteger(o.directorRevision)||o.directorRevision<1)throw new Error('Invalid saved simulation occurrences');ids.add(o.id);}
    if(JSON.stringify(saved.input.context??null).length>2_000_000)throw new Error('Saved audience context is too large');
  }
}
