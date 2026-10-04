import { bases, type TimeBasis } from './temporal';
import type { Camera } from './hologram';

// Built-in view foundation. These are honest views of the same three parallel planes,
// not a claim that independently ordered timelines are orthogonal projections of one point.
export type ReadingView = {
  id: TimeBasis;
  label: string;
  focusBasis: TimeBasis;
  content: 'all-entities';
  dimensions: { horizontal: 'occurrence-order'; depth: 'time-basis'; vertical: 'hierarchy' };
  encodings: { color: 'line-identity'; width: 'line-prominence'; dash: 'line-visibility' };
  detail: 'current-semantic-scale';
  camera: Pick<Camera,'yaw'|'pitch'|'zoom'>;
};
export const readingViews: ReadingView[] = [
  {id:'reality',label:'Reality',focusBasis:'reality',content:'all-entities',dimensions:{horizontal:'occurrence-order',depth:'time-basis',vertical:'hierarchy'},encodings:{color:'line-identity',width:'line-prominence',dash:'line-visibility'},detail:'current-semantic-scale',camera:{yaw:.12,pitch:.85,zoom:1.12}},
  {id:'narrative',label:'Narrative',focusBasis:'narrative',content:'all-entities',dimensions:{horizontal:'occurrence-order',depth:'time-basis',vertical:'hierarchy'},encodings:{color:'line-identity',width:'line-prominence',dash:'line-visibility'},detail:'current-semantic-scale',camera:{yaw:0,pitch:.58,zoom:1.12}},
  {id:'audience',label:'Audience',focusBasis:'audience',content:'all-entities',dimensions:{horizontal:'occurrence-order',depth:'time-basis',vertical:'hierarchy'},encodings:{color:'line-identity',width:'line-prominence',dash:'line-visibility'},detail:'current-semantic-scale',camera:{yaw:-.12,pitch:.85,zoom:1.12}},
];
export function validateReadingView(value:unknown): ReadingView {
  const v=value as ReadingView;
  if(!v||!bases.includes(v.id)||!bases.includes(v.focusBasis)||typeof v.label!=='string'||v.label.length>100||v.content!=='all-entities'||v.detail!=='current-semantic-scale'||v.dimensions?.horizontal!=='occurrence-order'||v.dimensions?.depth!=='time-basis'||v.dimensions?.vertical!=='hierarchy'||v.encodings?.color!=='line-identity'||v.encodings?.width!=='line-prominence'||v.encodings?.dash!=='line-visibility'||!v.camera||!['yaw','pitch','zoom'].every(k=>typeof v.camera[k as keyof typeof v.camera]==='number'&&Number.isFinite(v.camera[k as keyof typeof v.camera]))||Math.abs(v.camera.yaw)>1.15||v.camera.pitch<-.1||v.camera.pitch>1.15||v.camera.zoom<.45||v.camera.zoom>4)throw new Error('Unsupported reading-view configuration');
  return structuredClone(v);
}
export function readingCamera(view:ReadingView,width:number,height:number,project:(camera:Camera,point:{x:number;y:number;z:number})=>{x:number;y:number}):Camera {
  const valid=validateReadingView(view),camera={...valid.camera,panX:0,panY:0};
  const center=project(camera,{x:0,y:-25,z:(bases.indexOf(valid.focusBasis)-1)*250});
  return {...camera,panX:width/2-center.x,panY:height/2-center.y};
}
