import { StyleSheet, Text, View } from 'react-native';
import type { TrendPoint } from '../api/types';
import { colors } from '../theme';

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return <Text style={styles.empty}>No trend data yet</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {data.map((point) => (
          <View key={point.date} style={styles.col}>
            <View style={styles.track}>
              <View style={[styles.fill, { height: Math.max(4, Math.round((point.pct / 100) * 110)) }]} />
            </View>
            <Text style={styles.label}>{point.label.slice(0, 2)}</Text>
            <Text style={styles.pct}>{point.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 160, justifyContent: 'flex-end' },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    height: 160,
  },
  col: { flex: 1, alignItems: 'center', height: '100%' },
  track: {
    flex: 1,
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
    backgroundColor: colors.primary,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    minHeight: 4,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  pct: {
    fontSize: 10,
    color: colors.text,
    marginTop: 2,
  },
  empty: { color: colors.muted, fontSize: 13, fontStyle: 'italic' },
});
