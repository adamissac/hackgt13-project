import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { View, type ColorValue } from "react-native";

import { api } from "@/lib/api";
import { HACKGT_EVENT_ID } from "@/lib/constants";
import { env } from "@/lib/env";

import { AiFab } from "@/components/AiFab";
import { HeaderActions } from "@/components/HeaderActions";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";

type IconName = SymbolViewProps["name"];

function icon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={24} />;
  };
}

// Signed-in users are at HackGT 13: check in once when the app opens (idempotent on the server), so
// matches, graph, nearby and the assistant work without hunting for a button.
let checkedInThisSession = false;
function useAutoCheckin() {
  useEffect(() => {
    if (checkedInThisSession || env.useMocks) return;
    checkedInThisSession = true;
    api.checkin(HACKGT_EVENT_ID).catch((e) => {
      checkedInThisSession = false;
      console.warn('[api] auto check-in failed:', e instanceof Error ? e.message : e);
    });
  }, []);
}

export default function TabLayout() {
  useAutoCheckin();
  const colorScheme = useColorScheme();
  const headerShown = useClientOnlyValue(false, true);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          animation: "shift",
          sceneStyle: { backgroundColor: Colors[colorScheme].background },
          tabBarActiveTintColor: Colors[colorScheme].tint,
          tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
          tabBarStyle: {
            backgroundColor: Colors[colorScheme].surface,
            borderTopColor: Colors[colorScheme].border,
            elevation: 0,
          },
          headerStyle: { backgroundColor: Colors[colorScheme].background },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "600" },
          // Disable the static render of the header on web
          // to prevent a hydration error in React Navigation v6.
          headerShown,
          headerRight: () => <HeaderActions />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            tabBarIcon: icon({
              ios: "house.fill",
              android: "home",
              web: "home",
            }),
          }}
        />
        <Tabs.Screen
          name="nearby"
          options={{
            title: "Nearby",
            tabBarIcon: icon({
              ios: "dot.radiowaves.left.and.right",
              android: "wifi_tethering",
              web: "wifi_tethering",
            }),
          }}
        />
        <Tabs.Screen
          name="graph"
          options={{
            title: "Graph",
            tabBarIcon: icon({
              ios: "point.3.connected.trianglepath.dotted",
              android: "hub",
              web: "hub",
            }),
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            title: "Feed",
            tabBarIcon: icon({
              ios: "newspaper.fill",
              android: "feed",
              web: "feed",
            }),
          }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: "Messages",
            tabBarIcon: icon({
              ios: "bubble.left.and.bubble.right.fill",
              android: "forum",
              web: "forum",
            }),
          }}
        />
      </Tabs>
      {/* The AI assistant floats over every tab instead of taking a tab slot. */}
      <AiFab />
    </View>
  );
}
