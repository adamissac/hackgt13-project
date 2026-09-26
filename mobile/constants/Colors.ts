// Constellation: one light palette across native, web and navigation.
const light = {
  text: '#25272B',
  muted: '#6D7077',
  background: '#F8F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EFED',
  border: '#E4E3E0',
  tint: '#343A46',
  tintSoft: '#ECEEF1',
  onTint: '#FFFFFF',
  ai: '#626978',
  aiSoft: '#EFF0F3',
  success: '#15803D',
  successSoft: '#E8F6EC',
  danger: '#DC2626',
  tabIconDefault: '#85878C',
  tabIconSelected: '#343A46',
};


export type ColorName = keyof typeof light;
export default { light, dark: light };
export const FACET_COLORS = { technical: '#4B71CB', career: '#8B68B5', personal: '#288B91', academic: '#AB7943' };
