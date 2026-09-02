import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDailyAttendance } from '../api/attendance';
import type { ApiError, AttendanceFilter, DailyRow } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { isMissingOut, matchesFilter, rowHours, statusLabel, statusTone } from '../utils/attendance';
import { formatHours, formatTime, resolveTimezone, todayYmd } from '../utils/dates';

const FILTERS: { id: AttendanceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
  { id: 'late', label: 'Late' },
  { id: 'missing_out', label: 'Missing out' },
];

const TONE_BG: Record<ReturnType<typeof statusTone>, string> = {
  success: '#ecfdf5',
  danger: '#fff1f2',
  warning: '#fffbeb',
  sky: '#f0f9ff',
  muted: '#f8fafc',
};

const TONE_FG: Record<ReturnType<typeof statusTone>, string> = {
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  sky: colors.sky,
  muted: colors.muted,
};

export default function TodayScreen() {
  const { company } = useAuth();
  const tz = resolveTimezone(company);
  const date = todayYmd(tz);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchDailyAttendance(date);
        setRows(data);
      } catch (err) {
        setError((err as ApiError).message || 'Unable to load attendance');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const visible = useMemo(() => rows.filter((row) => matchesFilter(row, filter)), [rows, filter]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      present: rows.filter((r) => r.present).length,
      absent: rows.filter((r) => !r.present && !r.shift_pending).length,
      late: rows.filter((r) => r.late).length,
      missing_out: rows.filter((r) => isMissingOut(r)).length,
    }),
    [rows]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.chips}>
        {FILTERS.map((chip) => {
          const active = filter === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => setFilter(chip.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {chip.label} {counts[chip.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.employee_id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No employees match this filter.</Text>
          }
          renderItem={({ item }) => {
            const tone = statusTone(item);
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.code}>
                      {item.employee_code || '—'}
                      {item.branch_name ? ` · ${item.branch_name}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.status, { backgroundColor: TONE_BG[tone] }]}>
                    <Text style={[styles.statusText, { color: TONE_FG[tone] }]}>
                      {statusLabel(item)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  In {formatTime(item.first_in_time, tz)}
                  {item.late && item.minutes_late ? ` · Late ${item.minutes_late}m` : ''}
                  {' · '}
                  {formatHours(rowHours(item))}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  chipTextActive: { color: '#0A0A0A' },
  error: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff1f2',
    color: colors.danger,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 32, fontSize: 13 },
  row: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  code: { fontSize: 12, color: colors.muted, marginTop: 2 },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  meta: { marginTop: 10, fontSize: 12, color: colors.muted },
});
