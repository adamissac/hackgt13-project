// "Are you sure?" that works on phones (native Alert) and on web (window.confirm, since Alert is a no-op there).
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, body: string, okLabel: string, cancelLabel = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
