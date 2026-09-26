// Design tokens. Themed components read these; screens should never hardcode colors.
const light = {
  text: '#14161F',
  muted: '#6B7080',
  background: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEDE8',
  border: '#E4E2DC',
  tint: '#4F46E5',
  tintSoft: '#EEF0FF',
  onTint: '#FFFFFF',
  ai: '#7C3AED',
  aiSoft: '#F3EEFF',
  success: '#15803D',
  successSoft: '#E8F6EC',
  danger: '#DC2626',
  tabIconDefault: '#A3A7B3',
  tabIconSelected: '#4F46E5',
};

const dark: typeof light = {
  text: '#F2F3F7',
  muted: '#9AA0B0',
  background: '#0E0F14',
  surface: '#181A22',
  surfaceAlt: '#22252F',
  border: '#2A2D38',
  tint: '#8B93FF',
  tintSoft: '#23264A',
  onTint: '#0E0F14',
  ai: '#B794F6',
  aiSoft: '#2A2140',
  success: '#4ADE80',
  successSoft: '#15291D',
  danger: '#F87171',
  tabIconDefault: '#5C6170',
  tabIconSelected: '#8B93FF',
};

export type ColorName = keyof typeof light;
export default { light, dark };
