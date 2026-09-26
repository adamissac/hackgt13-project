// Tiny renderer for assistant replies: paragraphs, "•"/"-" bullet lines, and **bold**. No full markdown.
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

function inline(line: string, style: TextStyle, key: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text key={key} style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: '800' }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p.replace(/^#+\s*/, '')
        ),
      )}
    </Text>
  );
}

export function RichText({ text, style }: { text: string; style: TextStyle }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, b) => (
        <View key={b} style={{ gap: 4 }}>
          {block.split('\n').map((line, i) => {
            const m = line.match(/^\s*(?:[•\-*]|\d+[.)])\s+(.*)$/);
            if (m) {
              return (
                <View key={i} style={styles.bullet}>
                  <Text style={[style, styles.dot]}>•</Text>
                  <View style={{ flex: 1 }}>{inline(m[1], style, `${b}-${i}`)}</View>
                </View>
              );
            }
            return inline(line, style, `${b}-${i}`);
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  dot: { fontWeight: '800' },
});
