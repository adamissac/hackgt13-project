import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

type IconName = SymbolViewProps['name'];

function icon(name: IconName) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={26} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon({ ios: 'house.fill', android: 'home', web: 'home' }) }}
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
        name="feed"
        options={{ title: 'Feed', tabBarIcon: icon({ ios: 'newspaper.fill', android: 'feed', web: 'feed' }) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon({ ios: 'person.crop.circle', android: 'person', web: 'person' }) }}
      />
    </Tabs>
  );
}
