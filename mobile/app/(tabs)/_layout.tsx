import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

type IconName = SymbolViewProps['name'];

function icon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) { return <SymbolView name={name} tintColor={color} size={24} />; };
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const headerShown = useClientOnlyValue(false, true);

  return (
    <Tabs
      screenOptions={{
        animation: 'shift',
        sceneStyle: { backgroundColor: Colors[colorScheme].background },
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: Colors[colorScheme].surface, borderTopColor: Colors[colorScheme].border, elevation: 0 },
        headerStyle: { backgroundColor: Colors[colorScheme].background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: icon({ ios: 'house.fill', android: 'home', web: 'home' }) }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: icon({ ios: 'dot.radiowaves.left.and.right', android: 'wifi_tethering', web: 'wifi_tethering' }),
        }}
      />
      <Tabs.Screen
        name="graph"
        options={{ title: 'Graph', tabBarIcon: icon({ ios: 'point.3.connected.trianglepath.dotted', android: 'hub', web: 'hub' }) }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: 'Messages', tabBarIcon: icon({ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }) }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: 'Assistant', tabBarIcon: icon({ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon({ ios: 'person.crop.circle', android: 'person', web: 'person' }) }}
      />
    </Tabs>
  );
}
