// Navy banner at the top of each main tab, so every tab carries the brand color (Events set the style).
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConstellationMark } from './Brand';
import { useColors } from './ui';

export const HERO_TEXT = { eyebrow: '#B6C9FA', title: '#FFFFFF', body: '#D3DEF2' };

export function TabHero({ eyebrow, title, body, right, children, mark = true }: {
  eyebrow: string; title: string; body?: string; right?: ReactNode; children?: ReactNode; mark?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.hero, { backgroundColor: c.tint }]}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 10 }}>
          {mark && <ConstellationMark color={HERO_TEXT.eyebrow} size={36} />}
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        {right}
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  eyebrow: { color: HERO_TEXT.eyebrow, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: HERO_TEXT.title, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.9 },
  body: { color: HERO_TEXT.body, fontSize: 15, lineHeight: 22 },
});
