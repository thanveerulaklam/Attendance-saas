import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TrendChart from '../components/TrendChart';
import { fetchDashboardSummary } from '../api/dashboard';
import type { ApiError, DashboardSummary } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { formatTime, resolveTimezone } from '../utils/dates';

export default function DashboardScreen() {
  const { company } = useAuth();
  const tz = resolveTimezone(company);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary();
      setSummary(data);
    } catch (err) {
      setError((err as ApiError).message || 'Unable to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onBreak = summary?.todayOnLunch || [];
  const absent = summary?.todayAbsent || [];
  const branches = summary?.branchSummary || [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.kpi}>
        {loading && !summary ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.kpiTop}>
              <View>
                <Text style={styles.kpiLabel}>Today&apos;s attendance</Text>
                <Text style={styles.kpiValue}>
                  {summary?.todayPresent ?? 0} / {summary?.todayTotal ?? 0}
                </Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>Real-time</Text>
              </View>
            </View>
            <Text style={styles.kpiHint}>
              {summary?.todayTotal
                ? `${summary.todayPct}% present`
                : 'No attendance data yet'}
            </Text>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Currently on break</Text>
        <Text style={styles.cardHint}>Punched out for a break, not yet back</Text>
        {loading && !summary ? (
          <View style={styles.skeleton} />
        ) : onBreak.length === 0 ? (
          <Text style={styles.empty}>No one on break right now</Text>
        ) : (
          onBreak.map((emp) => (
            <View key={`${emp.name}-${emp.employee_code || ''}`} style={styles.breakRow}>
              <View style={[styles.dot, { backgroundColor: colors.sky }]} />
              <Text style={styles.rowName} numberOfLines={1}>
                {emp.name}
                {emp.employee_code ? ` (${emp.employee_code})` : ''}
              </Text>
              <Text style={styles.rowMeta}>
                {emp.break_name || 'Break'}
                {emp.punched_out_at ? ` · ${formatTime(emp.punched_out_at, tz)}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today&apos;s absent</Text>
        <Text style={styles.cardHint}>Employees who have not marked attendance today</Text>
        {loading && !summary ? (
          <View style={styles.skeleton} />
        ) : absent.length === 0 ? (
          <Text style={styles.empty}>Everyone is present today</Text>
        ) : (
          absent.map((name) => (
            <View key={name} style={styles.absentRow}>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <Text style={styles.rowName}>{name}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Branch-wise attendance</Text>
        <Text style={styles.cardHint}>Present, absent, and late by branch</Text>
        {loading && !summary ? (
          <View style={styles.skeleton} />
        ) : branches.length === 0 ? (
          <Text style={styles.empty}>No branch attendance data yet</Text>
        ) : (
          branches.map((branch) => (
            <View key={`${branch.branch_id}-${branch.branch_name}`} style={styles.branchRow}>
              <View style={styles.branchHead}>
                <Text style={styles.branchName}>{branch.branch_name}</Text>
                <Text style={styles.branchPct}>{branch.present_pct}%</Text>
              </View>
              <Text style={styles.branchMeta}>
                Present {branch.present} · Absent {branch.absent} · Late {branch.late} · {branch.total} total
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly attendance trend</Text>
        <Text style={styles.cardHint}>% present over the last 7 days</Text>
        {loading && !summary ? (
          <View style={[styles.skeleton, { height: 160 }]} />
        ) : (
          <TrendChart data={summary?.attendanceTrend || []} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  error: {
    backgroundColor: '#fff1f2',
    color: colors.danger,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    overflow: 'hidden',
  },
  kpi: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 108,
    justifyContent: 'center',
  },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kpiValue: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 6 },
  kpiHint: { marginTop: 10, fontSize: 13, color: colors.muted },
  pill: {
    backgroundColor: colors.pillBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11, fontWeight: '600', color: colors.primaryDark },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardHint: { fontSize: 12, color: colors.muted, marginTop: 4, marginBottom: 12 },
  empty: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
  skeleton: { height: 56, backgroundColor: '#f1f5f9', borderRadius: 10 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  absentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 11, color: colors.sky, maxWidth: 120, textAlign: 'right' },
  branchRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  branchHead: { flexDirection: 'row', justifyContent: 'space-between' },
  branchName: { fontSize: 14, fontWeight: '600', color: colors.text },
  branchPct: { fontSize: 14, fontWeight: '700', color: colors.success },
  branchMeta: { marginTop: 4, fontSize: 12, color: colors.muted },
});
