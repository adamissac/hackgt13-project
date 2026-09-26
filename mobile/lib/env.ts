// Client env: only values that are safe to ship in the app (see .env.example).
// EXPO_PUBLIC_* vars are inlined at build time, so they must be read with static property access.
// Defaults are the team project. A blank mobile/.env still signs in. Override by setting the vars.

import { isDemo } from './mode';

const TEAM_SUPABASE_URL = 'https://mwfzgkikbmnghueolfnw.supabase.co';
const TEAM_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13Znpna2lrYm1uZ2h1ZW9sZm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzODk0MjQsImV4cCI6MjEwNTk2NTQyNH0.V7YG254xemI5SE_3dWB_hbJ2nvZTLln8ITnUvnFL-CI';
const TEAM_API_BASE_URL = 'https://ml-production-04c0.up.railway.app';

function pick(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const env = {
  supabaseUrl: pick(process.env.EXPO_PUBLIC_SUPABASE_URL, TEAM_SUPABASE_URL),
  supabaseAnonKey: pick(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, TEAM_SUPABASE_ANON_KEY),
  apiBaseUrl: pick(process.env.EXPO_PUBLIC_API_BASE_URL, TEAM_API_BASE_URL).replace(/\/$/, ''),
  /** True while the app runs in demo mode (see lib/mode.ts). */
  get useMocks() {
    return isDemo();
  },
};

export const missingEnv = [
  !env.supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !env.supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  !env.apiBaseUrl && 'EXPO_PUBLIC_API_BASE_URL',
].filter(Boolean) as string[];
