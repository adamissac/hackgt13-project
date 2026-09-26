import { DashboardWebView } from '@/components/DashboardWebView';

// AD9 (wired by Arjun): the Connection Graph is Arjun's web page (dashboard/app/graph), embedded here.
// Auth goes over postMessage (see components/DashboardWebView.tsx).
export default function GraphScreen() {
  return <DashboardWebView path="/graph" />;
}
