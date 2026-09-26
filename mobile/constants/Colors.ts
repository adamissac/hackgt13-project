// Design tokens. Themed components read these; screens should never hardcode colors.
const light = {
  text: '#24352F',
  muted: '#65736C',
  background: '#F7F8F4',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EA',
  border: '#DFE5DB',
  tint: '#286047',
  tintSoft: '#E8F0E7',
  onTint: '#FFFFFF',
  ai: '#58694E',
  aiSoft: '#F0F3E9',
  success: '#15803D',
  successSoft: '#E8F6EC',
  danger: '#DC2626',
  tabIconDefault: '#78867D',
  tabIconSelected: '#286047',
};

const dark: typeof light = {
  text: '#EDF2EA',
  muted: '#A5B1A8',
  background: '#121B17',
  surface: '#1B2620',
  surfaceAlt: '#263229',
  border: '#344137',
  tint: '#A4D0AE',
  tintSoft: '#293E2E',
  onTint: '#15271C',
  ai: '#BCCBA3',
  aiSoft: '#2C3526',
  success: '#4ADE80',
  successSoft: '#15291D',
  danger: '#F87171',
  tabIconDefault: '#91A095',
  tabIconSelected: '#A4D0AE',
};

export type ColorName = keyof typeof light;
export default { light, dark };
