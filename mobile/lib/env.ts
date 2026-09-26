// Client env: only values that are safe to ship in the app (see .env.example).
// EXPO_PUBLIC_* vars are inlined at build time, so they must be read with static property access.

// Production deploy of dashboard/ (Vercel). Override with EXPO_PUBLIC_DASHBOARD_URL for a local/tunnel build.
const DEFAULT_DASHBOARD_URL = 'https://formal-connection-dashboard.vercel.app';

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, ''),
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS === '1',
  // Arjun's dashboard (graph, personal dashboard, insights) shown in WebViews. Public URL, not a secret.
  dashboardUrl: (process.env.EXPO_PUBLIC_DASHBOARD_URL || DEFAULT_DASHBOARD_URL).replace(/\/$/, ''),
};

export const missingEnv = [
  !env.supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !env.supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  !env.useMocks && !env.apiBaseUrl && 'EXPO_PUBLIC_API_BASE_URL',
].filter(Boolean) as string[];
