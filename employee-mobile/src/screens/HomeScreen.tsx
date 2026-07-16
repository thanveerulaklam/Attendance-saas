import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchMe } from '../api/attendance';
import type { MeResponse } from '../api/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, formatTime, statusLabel } from '../theme';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchMe();
      setMe(data);
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

  const today = me?.today;
  const lastPunch = today?.punches?.length
    ? today.punches[today.punches.length - 1]
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {me && (
        <>
          <Text style={styles.greeting}>Hello, {me.employee.name}</Text>
          <Text style={styles.meta}>
            {me.company.name} · {me.branch.name}
          </Text>

          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Today</Text>
            <Text style={styles.statusValue}>
              {statusLabel[today?.status || 'not_checked_in'] || today?.status}
            </Text>
            {lastPunch && (
              <Text style={styles.lastPunch}>
                Last: {formatTime(lastPunch.punch_time)} {lastPunch.punch_type?.toUpperCase()}
              </Text>
            )}
          </View>

          {!me.company.mobile_attendance_enabled && (
            <Text style={styles.warn}>
              Mobile attendance is off for your company. Contact HR.
            </Text>
          )}

          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Scan')}
          >
            <Text style={styles.primaryBtnText}>Mark attendance</Text>
            <Text style={styles.primaryBtnSub}>Scan office QR + GPS</Text>
          </Pressable>

          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Today' })}>
              <Text style={styles.secondaryBtnText}>Today</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Month' })}>
              <Text style={styles.secondaryBtnText}>Month</Text>
            </Pressable>
          </View>
        </>
      )}

      {loading && !me && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 20 },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  statusLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  statusValue: { fontSize: 24, fontWeight: '700', color: colors.violet, marginTop: 4 },
  lastPunch: { fontSize: 13, color: colors.muted, marginTop: 8 },
  warn: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 12,
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
  },
  error: { color: colors.danger, marginBottom: 12 },
  primaryBtn: {
    backgroundColor: colors.violet,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  primaryBtnSub: { color: '#e9d5ff', fontSize: 12, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
