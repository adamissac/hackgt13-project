// Shared assistant launcher sits above navigation on every signed-in screen.
import { router, usePathname, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatMark } from './Brand';
import { useColors } from './ui';

export function AiFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const segments = useSegments();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (path === '/assistant' || path === '/ai' || keyboardOpen) return null;
  const bottom = insets.bottom + (segments[0] === '(tabs)' ? 76 : 0) + 16;
  return <Pressable
    onPress={() => router.push('/assistant')}
    accessibilityRole="button" accessibilityLabel="Ask Constellation AI"
    style={({ pressed }) => [styles.fab, { backgroundColor: c.tint, bottom, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
    <View pointerEvents="none"><ChatMark color={c.onTint} size={34} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  fab: { position: 'absolute', zIndex: 100, left: 18, width: 60, height: 60, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#172D50',
    shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
});
