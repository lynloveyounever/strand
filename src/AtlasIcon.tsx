import type { Kind } from './model';
import type { TimeBasis } from './temporal';

export type AtlasIconName = Kind | TimeBasis | 'edit' | 'clock' | 'layers' | 'person' | 'path' | 'structure' | 'cube' | 'chevron' | 'help';
export const kindNames: Record<Kind,string> = { story: '故事', act: '幕', sequence: '段落', scene: '場', beat: '事件' };
export const basisNames: Record<TimeBasis,string> = { reality: '世界順序', narrative: '呈現順序', audience: '理解順序' };
/** One line-weight and semantic silhouette, shared by navigation and content. */
export function AtlasIcon({ name, className = '' }: { name: AtlasIconName; className?: string }) {
  const paths = {
    story: <><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v14"/></>,
    act: <><path d="M4 5h16v15H4zM7 2h13M2 8v12"/><path d="M8 10h8M8 14h5"/></>,
    sequence: <><rect x="2" y="4" width="6" height="6" rx="1.2"/><rect x="16" y="14" width="6" height="6" rx="1.2"/><path d="M5 10v7h11M8 7h7v10"/></>,
    scene: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 5l3 5M13 5l3 5"/></>,
    beat: <><path d="m12 5 7 7-7 7-7-7 7-7ZM2 12h3m14 0h3"/></>,
    reality: <><circle cx="12" cy="12" r="8.5"/><path d="M12 6v6l4 2"/></>,
    narrative: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/></>,
    audience: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    edit: <><path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 6Z"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 6v6l4 2"/></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/></>,
    person: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    path: <><path d="M5 5c11 0 3 14 14 14"/><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/></>,
    structure: <><rect x="8" y="2" width="8" height="5" rx="1"/><rect x="1" y="17" width="7" height="5" rx="1"/><rect x="16" y="17" width="7" height="5" rx="1"/><path d="M12 7v5H4v5m8-5h8v5"/></>,
    cube: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1"/></>,
  };
  return <svg className={`atlas-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function KindIcon({kind}: {kind:Kind}) { return <span className={`kind-icon kind-${kind}`} title={`${kindNames[kind]} · ${kind}`} aria-label={kindNames[kind]}><AtlasIcon name={kind}/></span>; }
