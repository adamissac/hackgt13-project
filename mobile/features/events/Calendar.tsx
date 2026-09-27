// Month calendar of the events you're attending (filled dot) or interested in (ring).
import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useColors } from '@/components/ui';

import { RSVP_OPTIONS, dayKey, eventDays, monthGrid, shiftMonth, type RsvpMap, type RsvpStatus } from './plan';
import type { NetworkingEvent } from './catalog';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Calendar({ year, month, onMonth, events, rsvps, selectedDay, onSelectDay }: {
  year: number; month: number; onMonth: (m: { year: number; month: number }) => void;
  events: NetworkingEvent[]; rsvps: RsvpMap; selectedDay: string; onSelectDay: (day: string) => void;
}) {
  const c = useColors();
  const today = dayKey(new Date());
  const byDay = new Map<string, RsvpStatus[]>();
  for (const e of events) {
    const s = rsvps[e.id];
    if (e.dateless) continue;
    if (s !== 'attending' && s !== 'interested') continue;
    for (const k of eventDays(e.startsAt, e.endsAt, e.tz)) byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const title = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Pressable onPress={() => onMonth(shiftMonth(year, month, -1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.nav}>
          <Text style={[styles.navText, { color: c.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{title}</Text>
        <Pressable onPress={() => onMonth(shiftMonth(year, month, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" style={styles.nav}>
          <Text style={[styles.navText, { color: c.text }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[styles.weekday, { color: c.muted }]}>{d}</Text>
        ))}
      </View>
      {monthGrid(year, month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const marks = byDay.get(day) ?? [];
            const selected = day === selectedDay;
            const isToday = day === today;
            const attending = marks.filter((m) => m === 'attending').length;
            const interested = marks.length - attending;
            const label = `${day}${marks.length ? `, ${attending} attending, ${interested} interested` : ''}`;
            return (
              <Pressable key={di} onPress={() => onSelectDay(day)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={styles.cell}>
                <View style={[styles.day, selected && { backgroundColor: c.tint }, !selected && isToday && { borderWidth: 1.5, borderColor: c.tint }]}>
                  <Text style={[styles.dayText, { color: selected ? c.onTint : c.text, fontWeight: isToday || marks.length ? '700' : '400' }]}>
                    {Number(day.slice(8))}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {marks.slice(0, 3).map((m, i) => (
                    <View key={i} style={[styles.dot, m === 'attending' ? { backgroundColor: c.success } : { borderWidth: 1.5, borderColor: c.ai }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: c.success }]} />
        <Text style={[styles.legendText, { color: c.muted }]}>{RSVP_OPTIONS[0].label}</Text>
        <View style={[styles.dot, { borderWidth: 1.5, borderColor: c.ai, marginLeft: 12 }]} />
        <Text style={[styles.legendText, { color: c.muted }]}>{RSVP_OPTIONS[1].label}</Text>
      </View>
    </View>
  );
}

/** Attending / Interested / Not attending. Tapping the current choice clears it.
 * Memoized with a stable `onPick(id, status)`, so a tap re-renders only this event's picker. The press bounce runs on
 * the UI thread (Reanimated) and the change is applied optimistically by the screen, so it never waits on a save. */
export const RsvpPicker = memo(function RsvpPicker({ id, value, onPick, disabled }: {
  id: string; value: RsvpStatus | undefined; onPick: (id: string, s: RsvpStatus) => void; disabled?: boolean;
}) {
  return (
    <View style={styles.picker} accessibilityRole="radiogroup">
      {RSVP_OPTIONS.map((o) => (
        <RsvpOption key={o.value} label={o.label} status={o.value} on={value === o.value} disabled={disabled}
          onPress={() => onPick(id, o.value)} />
      ))}
    </View>
  );
});

function RsvpOption({ label, status, on, disabled, onPress }: {
  label: string; status: RsvpStatus; on: boolean; disabled?: boolean; onPress: () => void;
}) {
  const c = useColors();
  const scale = useSharedValue(1);
  const bounce = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const tone = status === 'attending' ? c.success : status === 'interested' ? c.ai : c.muted;
  return (
    <Pressable disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={label}
      onPressIn={() => { scale.set(withTiming(0.93, { duration: 70 })); }}
      onPressOut={() => { scale.set(withSpring(1, { damping: 11, stiffness: 340 })); }}
      onPress={() => { void Haptics.selectionAsync().catch(() => undefined); onPress(); }}
      style={{ flex: label.length }}>
      <Animated.View style={[styles.option, { borderColor: on ? tone : c.border, backgroundColor: on ? tone : c.surface }, bounce]}>
        <Text numberOfLines={1} style={[styles.optionText, { color: on ? '#FFFFFF' : c.text }]}>{label}</Text>
        {on && (
          <View style={[styles.check, { borderColor: tone, backgroundColor: c.surface }]}>
            <Text style={[styles.checkText, { color: tone }]}>✓</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 28, lineHeight: 30 },
  title: { fontSize: 17, fontWeight: '700' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 48 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15 },
  dots: { flexDirection: 'row', gap: 3, height: 8, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 6 },
  legendText: { fontSize: 12 },
  picker: { flexDirection: 'row', gap: 8 },
  option: { minHeight: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  optionText: { fontSize: 13, fontWeight: '700' },
  check: { position: 'absolute', top: -7, right: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 11, fontWeight: '900', lineHeight: 13 },
});
