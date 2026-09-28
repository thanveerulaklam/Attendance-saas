import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function AccountScreen() {
  const { profile, signOut } = useAuth();
  const sites = profile?.sites || [];

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.label}>Employee</Text>
        <Text style={styles.value}>{profile?.employee.name || '—'}</Text>
        <Text style={styles.meta}>Code {profile?.employee.employee_code || '—'}</Text>
        <Text style={styles.label}>Company</Text>
        <Text style={styles.valueSmall}>{profile?.company.name || '—'}</Text>
        <Text style={styles.label}>Face</Text>
        <Text style={styles.meta}>{profile?.enrolled ? 'Registered' : 'Not registered'}</Text>
        <Text style={styles.label}>Assigned sites</Text>
        {sites.length === 0 ? (
          <Text style={styles.meta}>None yet. Ask HR to assign a field site.</Text>
        ) : (
          sites.map((site) => (
            <Text key={site.id} style={styles.meta}>
              {site.name} · {site.radius_m}m
            </Text>
          ))
        )}
      </View>

      <Pressable style={styles.linkBtn} onPress={() => void Linking.openURL(PRIVACY_URL)}>
        <Text style={styles.linkText}>Privacy policy</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={() => void signOut()}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  value: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 },
  valueSmall: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  linkBtn: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.primaryDark },
  logout: {
    marginTop: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
});
