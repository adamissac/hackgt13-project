import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, useColors } from '@/components/ui';

export function ConnectInPerson() {
  const c = useColors();
  return <Card>
    <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>Just met someone?</Text>
    <Text style={{ color: c.muted, marginVertical: 10 }}>Verify your meeting, then both choose whether to connect.</Text>
    <View style={{ gap: 8 }}>
      <Button label="Connect with QR or phone-tap" onPress={() => router.push('/verify')} />
      <Button label="Connect with GPS verification" onPress={() => router.push('/verify?mode=gps')} />
    </View>
  </Card>;
}
