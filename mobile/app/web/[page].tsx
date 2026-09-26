import { Stack, useLocalSearchParams } from 'expo-router';

import { DashboardWebView } from '@/components/DashboardWebView';
import { Empty } from '@/components/States';

// Arjun's private web pages (AR7), embedded: personal dashboard and feed insights.
const PAGES = {
  network: { path: '/me', title: 'Your network' },
  insights: { path: '/insights', title: 'Feed insights' },
} as const;

export default function WebPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const p = PAGES[page as keyof typeof PAGES];
  if (!p) return <Empty title="Page not found" />;
  return (
    <>
      <Stack.Screen options={{ title: p.title }} />
      <DashboardWebView path={p.path} />
    </>
  );
}
