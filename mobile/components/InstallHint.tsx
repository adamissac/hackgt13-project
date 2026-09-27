import { Platform, Text } from 'react-native';

import { Card, useColors } from '@/components/ui';

function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia('(display-mode: standalone)').matches;
}

/** Safari / Chrome: Share → Add to Home Screen. Hidden once the site already is the home-screen app. */
export function InstallHint() {
  const c = useColors();
  if (Platform.OS !== 'web' || isStandalone()) return null;
  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>Add this to your home screen</Text>
      <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
        In Safari tap Share, then Add to Home Screen. It opens like an app. Nearby Bluetooth still needs the
        phone install; QR verify and event join work here.
      </Text>
    </Card>
  );
}
