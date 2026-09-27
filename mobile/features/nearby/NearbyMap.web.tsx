// Browser proximity diagram: no inferred real-world directions or coordinates.
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColors } from '@/components/ui';
import type { Peer } from '@/features/ble';
import { browseSlots } from './geo';

export function NearbyMap({ peers, selectedId, onSelect, expanded = false }: {
  peers: Peer[]; selectedId: string | null; onSelect: (id: string | null) => void; expanded?: boolean;
}) {
  const c = useColors();
  return (
    <ScrollView style={{ height: expanded ? undefined : 360, flex: expanded ? 1 : undefined, minHeight: 200, backgroundColor: c.surface, borderRadius: expanded ? 0 : 18 }} contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', marginBottom: 24 }}>Matches around you</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 }}>
        {browseSlots(peers).map(({ peer: p }) => {
          const selected = p.user_id === selectedId;
          return <Pressable key={p.user_id} onPress={() => onSelect(p.user_id)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.band}`} accessibilityState={{ selected }}
            style={{ width: 64, minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: selected ? c.tint : c.surfaceAlt, borderWidth: 2, borderColor: selected ? c.tint : c.surface }}>
            <Text style={{ color: selected ? c.onTint : c.text, fontWeight: '600', fontSize: 13 }}>{(p.name || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</Text>
            <Text numberOfLines={1} style={{ maxWidth: 58, fontSize: 10, color: selected ? c.onTint : c.muted }}>{(p.name || 'Match').split(' ')[0]}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  );
}
