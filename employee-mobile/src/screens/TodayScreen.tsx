import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchToday } from '../api/attendance';
import type { Punch } from '../api/types';
import { colors, formatTime, statusLabel } from '../theme';

export default function TodayScreen() {
  const [punches, setPunches] = useState<Punch[]>([]);
  const [status, setStatus] = useState('not_checked_in');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchToday();
      setPunches(data.punches || []);
      setStatus(data.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today&apos;s punches</Text>
      <Text style={styles.status}>{statusLabel[status] || status}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && punches.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={punches}
          keyExtractor={(item, i) => String(item.id ?? i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No punches yet today.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.time}>{formatTime(item.punch_time)}</Text>
              <Text style={styles.type}>{item.punch_type?.toUpperCase()}</Text>
              <Text style={styles.source}>
                {item.device_id === 'mobile' ? 'Mobile' : item.device_id || '—'}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text },
  status: { fontSize: 14, color: colors.violet, marginTop: 4, marginBottom: 16 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  time: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  type: { fontSize: 13, fontWeight: '700', color: colors.primary, marginRight: 12 },
  source: { fontSize: 12, color: colors.muted },
});
