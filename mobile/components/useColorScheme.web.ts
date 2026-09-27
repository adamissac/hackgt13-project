// Light / dark / follow-system, backed by lib/appearance (persisted in AsyncStorage).
// Previously hardcoded to 'light'; the palette in constants/Colors.ts now has a real dark set.
export { useScheme as useColorScheme } from '@/lib/appearance';
