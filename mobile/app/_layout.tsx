import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/useOnboarding';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading, guest } = useAuth();
  const signedIn = Boolean(session) || guest;
  const onboarding = useOnboarding(signedIn);
  if (loading || (signedIn && onboarding === 'loading')) return null;
  // Every new account (any sign-in method) sees onboarding once before the app.
  const needsOnboarding = signedIn && onboarding === 'pending';
  const c = Colors[colorScheme];

  return (
    <ThemeProvider value={navTheme(colorScheme)}>
      <Stack
        screenOptions={{
          animation: 'ios_from_right',
          animationDuration: 280,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: c.background },
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          headerTintColor: c.tint,
        }}>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !needsOnboarding}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Match', headerBackTitle: 'Back' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerBackTitle: 'Back' }} />
          <Stack.Screen name="checklist/[id]" options={{ title: 'Checklist', headerBackTitle: 'Back' }} />
          <Stack.Screen name="connections" options={{ title: 'Your connections', headerBackTitle: 'Back' }} />
          <Stack.Screen name="feed" options={{ title: 'Feed', headerBackTitle: 'Back' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
          <Stack.Screen name="meetup/[id]" options={{ title: 'Find each other', headerBackTitle: 'Back' }} />
          <Stack.Screen name="verify" options={{ title: 'Verify a conversation', headerBackTitle: 'Back' }} />
          <Stack.Screen name="invites" options={{ title: 'Invite someone', headerBackTitle: 'Back' }} />
          <Stack.Screen name="network" options={{ title: 'Your network', headerBackTitle: 'Back' }} />
          <Stack.Screen name="insights" options={{ title: 'Feed insights', headerBackTitle: 'Back' }} />
          <Stack.Screen name="accounts" options={{ title: 'Your sources', headerBackTitle: 'Back' }} />
          <Stack.Screen name="connect/github" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        {/* Invite links must open signed out too; the screen handles sign-in itself. */}
        <Stack.Screen name="invite/[token]" options={{ title: 'Invite', headerBackTitle: 'Back' }} />
      </Stack>
    </ThemeProvider>
  );
}

function navTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.surface, text: c.text, border: c.border },
  };
}
