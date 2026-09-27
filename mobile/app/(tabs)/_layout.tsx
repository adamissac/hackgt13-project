import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View, type ColorValue } from 'react-native';
import { HeaderActions } from '@/components/HeaderActions';
import { Brand } from '@/components/Brand';
import { useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { getCurrentEventId, loadCurrentEvent, setCurrentEventId } from '@/lib/currentEvent';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

function icon(name: SymbolViewProps['name']) {
 return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  const tintSoft = useColors().tintSoft;
  return <View style={{ width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? tintSoft : 'transparent' }}>
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
    loadCurrentEvent()
      .then(async (eventId) => {
        const id = eventId || getCurrentEventId();
        if (id === HACKGT_EVENT_ID) return api.checkin(id);
        // A company event only lets you in by scanning its QR. If you're no longer checked in there
        // (you left, or it ended), go back to roaming instead of showing "check in first" everywhere.
        const mine = (await api.listEvents()).events.find((e) => e.id === id);
        if (mine?.checked_in) return;
        await setCurrentEventId(HACKGT_EVENT_ID);
        return api.checkin(HACKGT_EVENT_ID);
      })
      .catch((e) => {
        checkedIn.delete(userId);
        console.warn("[api] auto check-in failed:", e instanceof Error ? e.message : e);
      });
  }, [userId]);
}

export default function TabLayout() {
 useAutoCheckin();
 const c = useColors();
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
  <Tabs.Screen name="index" options={{title:'Home', headerShown:false, tabBarIcon:icon({ios:'house.fill',android:'home',web:'home'})}}/>
  <Tabs.Screen name="feed" options={{title:'Feed', headerTitle:()=> <Brand/>, tabBarIcon:icon({ios:'newspaper',android:'dynamic_feed',web:'dynamic_feed'})}}/>
  <Tabs.Screen name="graph" options={{title:'Constellation',tabBarLabelStyle:{fontSize:10,fontWeight:'700',marginTop:3},tabBarIcon:icon({ios:'point.3.connected.trianglepath.dotted',android:'hub',web:'hub'})}}/>
  <Tabs.Screen name="nearby" options={{href:null,title:'Nearby'}}/>
  <Tabs.Screen name="events" options={{title:'Events',tabBarIcon:icon({ios:'calendar',android:'event',web:'event'})}}/>
  <Tabs.Screen name="me" options={{title:'Profile',tabBarIcon:icon({ios:'person.crop.circle',android:'account_circle',web:'account_circle'})}}/>
  <Tabs.Screen name="discover" options={{href:null,title:'Meeting activity',headerShown:false}}/>
  <Tabs.Screen name="ai" options={{href:null}}/>
  <Tabs.Screen name="chats" options={{href:null,title:'Messages'}}/>
 </Tabs>;
}
