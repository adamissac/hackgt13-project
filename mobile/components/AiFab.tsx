// Floating ✦ button on every tab: the AI assistant is always one tap away (opens as a sheet).
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/components/ui';

const TAB_BAR = 49; // iOS/Android standard bottom tab bar height (without the safe-area inset)

export function AiFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => router.push('/assistant')}
      accessibilityRole="button"
      accessibilityLabel="Ask the AI assistant"
      hitSlop={8}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: c.ai, bottom: insets.bottom + TAB_BAR + 16, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}>
      <Text style={styles.icon}>✦</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: -2 },
});
