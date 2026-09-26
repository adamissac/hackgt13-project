import { StyleSheet } from 'react-native';

import { Empty } from '@/components/States';
import { View } from '@/components/Themed';

// AD11: AI-ranked GET /feed plus the post and update composer.
export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Empty title="Nothing in your feed yet" body="Posts and updates from your connections show up here." />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
