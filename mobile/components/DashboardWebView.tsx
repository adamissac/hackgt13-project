import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ErrorState, Loading } from '@/components/States';
import { View } from '@/components/Themed';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

type Path = '/graph' | '/me' | '/insights';

/**
 * Arjun's dashboard pages (MASTER_SPEC 4.1: graph built once on the web, embedded here).
 * Auth goes by postMessage only, never in the URL: after load, when the page says {type: "ready"},
 * and on every token refresh we post {type: "auth", token, api}. `api` tells the page which ML server the
 * app uses (omitted in mock mode, so the page shows its preview data).
 */
export function DashboardWebView({ path }: { path: Path }) {
  const ref = useRef<WebView>(null);
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = session?.access_token ?? null;

  const sendAuth = useCallback(() => {
    const msg = JSON.stringify({ type: 'auth', token, api: env.useMocks ? null : env.apiBaseUrl || null });
    // window.postMessage reaches the page's listener on both iOS and Android
    ref.current?.injectJavaScript(`window.postMessage(${JSON.stringify(msg)}, '*'); true;`);
  }, [token]);

  // token refreshed or signed in/out while the page is open
  useEffect(() => {
    sendAuth();
  }, [sendAuth]);

  const onMessage = async (e: WebViewMessageEvent) => {
    let data: { type?: string; dataUrl?: string } = {};
    try {
      data = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'ready') sendAuth();
    if (data.type === 'export_png' && typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:image/png')) {
      await Share.share({ url: data.dataUrl }).catch(() => {});
    }
  };

  if (error) {
    return (
      <ErrorState
        message={`Couldn't open this page. ${error}`}
        onRetry={() => {
          setError(null);
          setAttempt((a) => a + 1);
        }}
      />
    );
  }

  return (
    <View style={styles.fill}>
      <WebView
        key={attempt}
        ref={ref}
        source={{ uri: `${env.dashboardUrl}${path}` }}
        onLoadEnd={sendAuth}
        onMessage={onMessage}
        onError={(e) => setError(e.nativeEvent.description || 'Network error')}
        onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setError(`Server error ${e.nativeEvent.statusCode}`)}
        startInLoadingState
        renderLoading={() => <Loading label="Loading…" />}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures={false}
        setSupportMultipleWindows={false}
        style={styles.fill}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
