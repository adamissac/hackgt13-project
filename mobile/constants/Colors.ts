// Constellation: one light palette across native, web and navigation.
const light = {
  text: '#142440', muted: '#62718A', background: '#F7F9FD',
  surface: '#FFFFFF', surfaceAlt: '#EEF2F8', border: '#E0E7F1',
  tint: '#172D50', tintSoft: '#EAF0FA', onTint: '#FFFFFF',
  ai: '#4867D6', aiSoft: '#EFF2FF', success: '#237665', successSoft: '#EAF6F1',
  danger: '#C6354F', tabIconDefault: '#78859A', tabIconSelected: '#172D50',
};
export type ColorName = keyof typeof light;
export default { light, dark: light };
export const FACET_COLORS = { technical: '#4B71CB', career: '#8B68B5', personal: '#288B91', academic: '#AB7943' };
