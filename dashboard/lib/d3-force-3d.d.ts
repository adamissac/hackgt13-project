// d3-force-3d ships without types; we only use forceCollide (same API as d3-force).
declare module "d3-force-3d" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCollide<N = any>(radius?: number | ((node: N) => number)): (alpha: number) => void;
}
