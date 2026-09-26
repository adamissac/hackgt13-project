// Client env: only values that are safe to ship in the app (see .env.example).
// EXPO_PUBLIC_* vars are inlined at build time, so they must be read with static property access.

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, ''),
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS === '1',
};

export const missingEnv = [
  !env.supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !env.supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  !env.useMocks && !env.apiBaseUrl && 'EXPO_PUBLIC_API_BASE_URL',
].filter(Boolean) as string[];
