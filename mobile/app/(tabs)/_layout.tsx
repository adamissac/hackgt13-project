import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View, type ColorValue } from 'react-native';
import { HeaderActions } from '@/components/HeaderActions';
import { Brand } from '@/components/Brand';
import Colors from '@/constants/Colors';
import { api } from '@/lib/api';
import { getCurrentEventId, loadCurrentEvent } from '@/lib/currentEvent';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

function icon(name: SymbolViewProps['name']) {
 return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return <View style={{ width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? Colors.light.tintSoft : 'transparent' }}>
   <SymbolView name={name} tintColor={color} size={23}/>
  </View>;
 };
}
// Signed-in users are at HackGT 13: check in once when the app opens (idempotent on the server), so
// matches, graph, nearby and the assistant work without hunting for a button.
const checkedIn = new Set<string>(); // per signed-in user, so switching accounts checks the new one in
function useAutoCheckin() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId || env.useMocks || checkedIn.has(userId)) return;
    checkedIn.add(userId);
    loadCurrentEvent().then((eventId) => api.checkin(eventId || getCurrentEventId())).catch((e) => {
      checkedIn.delete(userId);
      console.warn("[api] auto check-in failed:", e instanceof Error ? e.message : e);
    });
  }, [userId]);
}

export default function TabLayout() {
 useAutoCheckin();
 const c = Colors.light;
 const insets = useSafeAreaInsets();
 return <Tabs initialRouteName="index" screenOptions={{
  animation: 'shift', sceneStyle: { backgroundColor: c.background },
  tabBarActiveTintColor: c.tint, tabBarInactiveTintColor: c.tabIconDefault,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, paddingTop: 6, height: 76 + insets.bottom, paddingBottom: Math.max(insets.bottom, 6), elevation: 0 },
  tabBarItemStyle: { paddingBottom: 4 },
  headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' }, headerRight: () => <HeaderActions />,
 }}>
  <Tabs.Screen name="index" options={{title:'Feed', headerTitle:()=> <Brand/>, tabBarIcon:icon({ios:'house.fill',android:'home',web:'home'})}}/>
  <Tabs.Screen name="graph" options={{title:'Constellation',tabBarLabelStyle:{fontSize:10,fontWeight:'700',marginTop:3},tabBarIcon:icon({ios:'point.3.connected.trianglepath.dotted',android:'hub',web:'hub'})}}/>
  <Tabs.Screen name="nearby" options={{title:'Nearby',tabBarIcon:icon({ios:'dot.radiowaves.left.and.right',android:'wifi_tethering',web:'wifi_tethering'})}}/>
  <Tabs.Screen name="events" options={{title:'Events',tabBarIcon:icon({ios:'calendar',android:'event',web:'event'})}}/>
  <Tabs.Screen name="me" options={{title:'Profile',tabBarIcon:icon({ios:'person.crop.circle',android:'account_circle',web:'account_circle'})}}/>
  <Tabs.Screen name="feed" options={{href:null,title:'Feed'}}/>
  <Tabs.Screen name="discover" options={{href:null,title:'Meeting activity',headerShown:false}}/>
  <Tabs.Screen name="ai" options={{href:null}}/>
  <Tabs.Screen name="chats" options={{href:null,title:'Messages'}}/>
 </Tabs>;
}
