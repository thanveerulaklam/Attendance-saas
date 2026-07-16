import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchMonthly } from '../api/attendance';
import type { MonthlyDay } from '../api/types';
import { colors, formatDate } from '../theme';

export default function MonthScreen() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<MonthlyDay[]>([]);
  const [summary, setSummary] = useState<{
    present_days?: number;
    absent_days?: number;
    late_days?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMonthly(year, month);
      setDays(data.days || []);
      setSummary(data.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={styles.nav}>
        <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      {summary && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            Present {summary.present_days ?? 0} · Absent {summary.absent_days ?? 0} · Late{' '}
            {summary.late_days ?? 0}
          </Text>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(item) => item.date}
          ListEmptyComponent={<Text style={styles.empty}>No data for this month.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.date}>{formatDate(item.date)}</Text>
              <Text
                style={[
                  styles.badge,
                  item.present ? styles.present : styles.absent,
                ]}
              >
                {item.status || (item.present ? 'Present' : 'Absent')}
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
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { padding: 12 },
  navBtnText: { fontSize: 28, color: colors.primary, fontWeight: '300' },
  monthTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  summary: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 10,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryText: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  date: { fontSize: 15, color: colors.text },
  badge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  present: { backgroundColor: '#d1fae5', color: '#065f46' },
  absent: { backgroundColor: '#f1f5f9', color: colors.muted },
});
