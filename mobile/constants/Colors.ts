// Constellation: one light palette across native, web and navigation.
const light = {
  text: '#25272B',
  muted: '#6D7077',
  background: '#F8F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EFED',
  border: '#E4E3E0',
  tint: '#1E3A8A',
  tintSoft: '#E6ECF8',
  onTint: '#FFFFFF',
  ai: '#475A8C',
  aiSoft: '#EDF1F9',
  success: '#15803D',
  successSoft: '#E8F6EC',
  danger: '#DC2626',
  tabIconDefault: '#7C89AA',
  tabIconSelected: '#1E3A8A',
};


/**
 * Dark palette. Two deliberate choices worth knowing before you tune it:
 *
 * `tint` stays a mid blue rather than a pale one, because ~40 places in the app hardcode '#fff'
 * for label text on tinted buttons. White on #4A6CD4 is roughly 4.9:1, so all of those stay
 * legible; a pale tint would have broken every one of them at once.
 *
 * Greys step up rather than invert: a pure #000 background makes elevation unreadable, so
 * background < surface < surfaceAlt climb in lightness the same way the light palette does.
 */
const dark: typeof light = {
  text: '#ECEDEF',
  muted: '#9AA0A9',
  background: '#0F1115',
  surface: '#171A20',
  surfaceAlt: '#1F232B',
  border: '#2A2F38',
  tint: '#4A6CD4',
  tintSoft: '#1B2440',
  onTint: '#FFFFFF',
  ai: '#8FA3D9',
  aiSoft: '#1B2436',
  success: '#3FBF6A',
  successSoft: '#14301E',
  danger: '#F87171',
  tabIconDefault: '#79839B',
  tabIconSelected: '#8AA4EE',
};

export type ColorName = keyof typeof light;
export default { light, dark };

/** Facet hues, lightened for dark backgrounds; the light set is too dense to read on #0F1115. */
export const FACET_COLORS = { technical: '#4B71CB', career: '#8B68B5', personal: '#288B91', academic: '#AB7943' };
export const FACET_COLORS_DARK = { technical: '#7B9BEF', career: '#B08FD8', personal: '#45B3B9', academic: '#D2A06A' };
