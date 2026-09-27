// Preview of the resume / LinkedIn PDF you uploaded, on the "Your sources" screen. The file lives in the private
// `resumes` bucket under <your user id>/, and both the `resumes` row and the object are owner-read under RLS, so
// the app reads them directly with the signed-in session (no server call). Links are signed for 10 minutes.
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Loading } from '@/components/States';
import { Button, useColors } from '@/components/ui';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

interface ResumeFile {
  filename: string;
  size_bytes: number;
  created_at: string;
  error: string | null;
  url: string | null;
}

async function latestResume(): Promise<ResumeFile | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('storage_path, filename, size_bytes, created_at, error')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { storage_path: string; filename: string; size_bytes: number; created_at: string; error: string | null };
  const signed = row.error ? null : await supabase.storage.from('resumes').createSignedUrl(row.storage_path, 600);
  return { ...row, url: signed?.data?.signedUrl ?? null };
}

const size = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

/** `version` changes after an upload so the preview reloads. */
export function ResumePreview({ version }: { version: string | null }) {
  const c = useColors();
  const file = useAsync(() => (env.useMocks ? Promise.resolve(null) : latestResume()), [version]);
  const [opening, setOpening] = useState(false);

  if (env.useMocks) {
    return (
      <View style={[styles.empty, { borderColor: c.border }]}>
        <Text style={[styles.small, { color: c.muted }]}>Sign in to see a preview of your uploaded file here.</Text>
      </View>
    );
  }
  if (file.state.status === 'loading') return <Loading label="Loading your file…" />;
  if (file.state.status === 'error') {
    return <Text style={[styles.small, { color: c.danger }]}>Couldn’t load your file: {file.state.message}</Text>;
  }
  const f = file.state.data;
  if (!f) return null;

  // Fetch a fresh link on open, since the one used for the preview may have expired.
  const open = async () => {
    setOpening(true);
    try {
      const fresh = await latestResume();
      if (fresh?.url) await WebBrowser.openBrowserAsync(fresh.url);
    } finally {
      setOpening(false);
    }
  };
  const isPdf = /\.pdf$/i.test(f.filename);

  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={f.url ? open : undefined} accessibilityRole="button" accessibilityLabel={`Open ${f.filename}`}
        style={[styles.page, { borderColor: c.border, backgroundColor: '#FFFFFF' }]}>
        {f.url && Platform.OS === 'ios' ? (
          // iOS renders PDF and DOCX inline. The overlay keeps taps opening the full viewer instead of scrolling.
          <>
            <WebView source={{ uri: f.url }} style={StyleSheet.absoluteFill} scrollEnabled={false} originWhitelist={['https://*']} />
            <View style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <View style={styles.placeholder}>
            <View style={[styles.badge, { backgroundColor: c.tint }]}>
              <Text style={styles.badgeText}>{isPdf ? 'PDF' : 'DOC'}</Text>
            </View>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{f.filename}</Text>
          </View>
        )}
      </Pressable>
      <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
        {f.filename} · {size(f.size_bytes)} · uploaded {new Date(f.created_at).toLocaleDateString()}
      </Text>
      {f.url ? (
        <Button label="View full file" variant="secondary" onPress={open} loading={opening} />
      ) : (
        <Text style={[styles.small, { color: c.muted }]}>
          We read this file, but it couldn’t be saved for viewing. Upload it again to see it here.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { height: 260, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  badge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  badgeText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 },
  name: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 14 },
  small: { fontSize: 13, lineHeight: 18 },
});
