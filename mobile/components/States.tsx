import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.muted}>{body}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const tint = useThemeColor({}, 'tint');
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.button, { borderColor: tint }]} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: tint }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  muted: { fontSize: 16, opacity: 0.65, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: 24, borderWidth: 2, borderRadius: 12, justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
