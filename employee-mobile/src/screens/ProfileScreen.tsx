import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMe } from '../api/attendance';
import { useAuth } from '../context/AuthContext';
import type { MeResponse } from '../api/types';
import { colors } from '../theme';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchMe()
        .then(setMe)
        .catch(() => setMe(null))
        .finally(() => setLoading(false));
    }, [])
  );

  if (loading && !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{me?.employee.name}</Text>
      <Text style={styles.line}>Code: {me?.employee.employee_code}</Text>
      <Text style={styles.line}>Company: {me?.company.name}</Text>
      <Text style={styles.line}>Branch: {me?.branch.name}</Text>
      <Text style={styles.line}>
        Channel: {me?.employee.attendance_channel || 'device'}
      </Text>
      {me?.shift && (
        <Text style={styles.line}>
          Shift: {me.shift.shift_name} ({me.shift.start_time} – {me.shift.end_time})
        </Text>
      )}

      <Pressable style={styles.logout} onPress={() => signOut()}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 16 },
  line: { fontSize: 15, color: colors.muted, marginBottom: 8 },
  logout: {
    marginTop: 32,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: 16 },
});
