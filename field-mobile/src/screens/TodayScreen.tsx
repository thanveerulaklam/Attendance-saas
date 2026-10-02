import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchBeatToday, fetchToday } from '../api/field';
import type { BeatVisit, Punch } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { colors, formatTime, statusLabel } from '../theme';

export default function TodayScreen() {
  const { profile } = useAuth();
  const beatEnabled = Boolean(profile?.employee?.field_beat_enabled);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [visits, setVisits] = useState<BeatVisit[]>([]);
  const [visitCount, setVisitCount] = useState(0);
  const [status, setStatus] = useState('not_checked_in');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchToday();
      setPunches(data.punches || []);
      setStatus(data.status);
      if (beatEnabled) {
        const beat = await fetchBeatToday().catch(() => null);
        setVisits(beat?.visits || []);
        setVisitCount(beat?.visit_count || 0);
      } else {
        setVisits([]);
        setVisitCount(0);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [beatEnabled]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today&apos;s punches</Text>
      <Text style={styles.status}>{statusLabel[status] || status}</Text>
      {beatEnabled ? (
        <Text style={styles.status}>
          {visitCount} visit{visitCount === 1 ? '' : 's'}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && punches.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={punches}
          keyExtractor={(item, i) => String(item.id ?? i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<Text style={styles.empty}>No punches yet today.</Text>}
          ListFooterComponent={
            beatEnabled && visits.length > 0 ? (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.heading}>Visits</Text>
                {visits.map((visit, index) => (
                  <View key={visit.id} style={styles.row}>
                    <Text style={styles.time}>{formatTime(visit.visited_at)}</Text>
                    <Text style={styles.type}>{visit.label || `Visit ${index + 1}`}</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.time}>{formatTime(item.punch_time)}</Text>
              <Text style={styles.type}>{item.punch_type?.toUpperCase()}</Text>
              <Text style={styles.source}>
                {item.device_id === 'field'
                  ? 'Field'
                  : item.device_id === 'mobile'
                    ? 'Mobile'
                    : item.device_id || '—'}
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
  heading: { fontSize: 22, fontWeight: '800', color: colors.text },
  status: { fontSize: 14, color: colors.violet, marginTop: 4, marginBottom: 8 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  time: { fontSize: 16, fontWeight: '700', color: colors.text, width: 88 },
  type: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, flex: 1 },
  source: { marginLeft: 'auto', fontSize: 12, color: colors.muted },
});
