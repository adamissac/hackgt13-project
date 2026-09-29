import manifest from '../public/screens/manifest.json';

export type Box = [number, number, number, number];
export interface ScreenDef {
  file: string; w: number; h: number; top: string; bottom: string; headerH?: number;
  boxes: Record<string, any>; rows?: any[]; bars?: any[]; switchBox?: Box;
}
/** Real app screens captured from the Expo web build in demo mode (see scripts/capture). Units are points. */
export const M = manifest as unknown as Record<string, ScreenDef>;
const TABS = ['home_off', 'home_on', 'home_waiting', 'home_mutual', 'feed', 'feed2', 'graph', 'graph_network', 'profile_review'];
const STACK = ['match_maya', 'checklist', 'checklist_checked', 'followup', 'connected', 'chat_maya', 'verify_code', 'verify', 'assistant'];
export const fixedTop = (id: string) => M[id].headerH ?? (STACK.includes(id) ? 52 : 0);
export const fixedBottom = (id: string) => (TABS.includes(id) ? 76 : 0);
export const ctr = (b: Box): [number, number] => [b[0] + b[2] / 2, b[1] + b[3] / 2];
export const bx = (id: string, key: string): Box => (M[id]?.boxes?.[key] ?? [0, 0, 0, 0]) as Box;
