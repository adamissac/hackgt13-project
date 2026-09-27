import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';

function icon(name: SymbolViewProps['name']) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View
        style={{
          width: 52,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? Colors.light.tintSoft : 'transparent',
        }}>
        <SymbolView name={name} tintColor={color} size={23} />
      </View>
    );
  };
}

export default function CompanyTabs() {
  const c = Colors.light;
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        animation: 'shift',
        sceneStyle: { backgroundColor: c.background },
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.tabIconDefault,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 3 },
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          paddingTop: 6,
          height: 76 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          elevation: 0,
        },
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Events', tabBarIcon: icon({ ios: 'calendar', android: 'event', web: 'event' }) }}
      />
      <Tabs.Screen
        name="new"
        options={{ title: 'New event', tabBarIcon: icon({ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }) }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: 'Company', tabBarIcon: icon({ ios: 'building.2', android: 'business', web: 'business' }) }}
      />
      <Tabs.Screen name="event/[id]" options={{ href: null, title: 'Event studio' }} />
    </Tabs>
  );
}
