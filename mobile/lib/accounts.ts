// Account connections: GitHub connect in an in-app browser, resume upload, and waiting on extraction jobs.
// Same auth-session pattern as LinkedIn sign-in in lib/auth.tsx. Tokens never touch the app: the ML service
// keeps GitHub's token server-side and sends us back to formalconnect://connect/github?status=ok|error.
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api, type JobStatus } from './api';
import { demo } from './demo';
import { env } from './env';

export const githubReturnUrl = Linking.createURL('connect/github');

export type ConnectResult = 'connected' | 'cancelled' | { error: string };

const GITHUB_ERRORS: Record<string, string> = {
  denied: 'GitHub access was cancelled.',
  oauth: 'GitHub didn’t finish connecting. Try again.',
};

/** Parse the deep link the ML service redirects to after GitHub's callback. */
export function parseGithubReturn(url: string): ConnectResult {
  const { queryParams } = Linking.parse(url);
  if (queryParams?.status === 'ok') return 'connected';
  const reason = String(queryParams?.reason ?? 'oauth');
  return { error: GITHUB_ERRORS[reason] ?? GITHUB_ERRORS.oauth };
}

export async function connectGithub(): Promise<ConnectResult> {
  if (env.useMocks) {
    await new Promise((r) => setTimeout(r, 1200));
    demo.addSource('github');
    return 'connected';
  }
  const { url } = await api.githubStart();
  const result = await WebBrowser.openAuthSessionAsync(url, githubReturnUrl);
  if (result.type !== 'success') return 'cancelled';
  return parseGithubReturn(result.url);
}

/** Pick a PDF and upload it; returns the extraction job id, or null if the user cancelled. */
export async function uploadResume(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) {
    console.log('[resume] picker cancelled');
    return null;
  }
  const file = picked.assets[0];
  console.log('[resume] picked', file.name, file.mimeType, file.size, 'bytes');
  if (file.size != null && file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
  if (env.useMocks) {
    await new Promise((r) => setTimeout(r, 1500));
    demo.addSource('resume');
    return 'demo-job';
  }
  try {
    const { job_id } = await api.ingestResume({ uri: file.uri, name: file.name, type: file.mimeType ?? 'application/pdf' });
    console.log('[resume] uploaded, job', job_id);
    return job_id;
  } catch (e) {
    console.warn('[resume] upload failed:', e instanceof Error ? e.message : e);
    throw e;
  }
}

/** Poll GET /profile/status until the job finishes. Extraction usually takes 5-20 s. */
export async function waitForJob(jobId: string, timeoutMs = 90_000): Promise<Exclude<JobStatus, 'queued' | 'running'>> {
  if (env.useMocks) return 'done';
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const s = await api.profileStatus(jobId);
    if (s.status === 'done') return 'done';
    if (s.status === 'error') throw new Error(s.error ?? 'Extraction failed.');
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Still working on it. Check back in a minute.');
}

export function signInLabel(provider: string | null): string {
  if (provider === 'linkedin') return 'LinkedIn';
  if (provider === 'github') return 'GitHub';
  if (provider === 'email') return 'email link';
  return provider ?? 'unknown';
}
