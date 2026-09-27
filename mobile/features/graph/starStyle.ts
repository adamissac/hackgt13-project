// Bright, distinct hues for a dark sky. Shared-interest categories retain their meaning.
export const STAR_COLORS = { technical: '#59BFFF', career: '#E990EA', personal: '#62E4AD', academic: '#FFC568' };

/** Score is normalized to 0–1 by the graph contract; keep tiny stars tappable. */
export function starSize(score: number) {
  const normalized = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  return 16 + normalized * 28;
}
