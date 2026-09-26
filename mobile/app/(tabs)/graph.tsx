import { StyleSheet } from 'react-native';

import { Empty } from '@/components/States';
import { View } from '@/components/Themed';

// AD9: this tab becomes a react-native-webview loading Arjun's graph page (AR4),
// posting {type: "auth", token} after load and on every token refresh.
export default function GraphScreen() {
  return (
    <View style={styles.container}>
      <Empty title="Your connection graph" body="Your network appears here once you make connections." />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
