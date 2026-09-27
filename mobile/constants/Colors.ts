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


export type ColorName = keyof typeof light;
export default { light, dark: light };
export const FACET_COLORS = { technical: '#4B71CB', career: '#8B68B5', personal: '#288B91', academic: '#AB7943' };
