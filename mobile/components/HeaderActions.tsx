// Top-right on every tab: notifications bell + your avatar (opens Profile).
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, useColors } from '@/components/ui';
import { useUnreadCount } from '@/features/notifications/useUnread';

export function HeaderActions() {
  const c = useColors();
  const unread = useUnreadCount();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push('/notifications')}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        hitSlop={8}
        style={[styles.bell, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ fontSize: 17 }}>🔔</Text>
        {unread > 0 && (
          <View style={[styles.badge, { backgroundColor: c.danger }]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Pressable>
      <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Your profile" hitSlop={8}>
        <Avatar name="You" size={40} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 },
  bell: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
