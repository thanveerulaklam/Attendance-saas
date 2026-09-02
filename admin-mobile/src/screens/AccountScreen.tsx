import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_URL, WEB_APP_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function AccountScreen() {
  const { user, company, signOut } = useAuth();
  const role = user?.role === 'hr' ? 'HR' : 'Admin';

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.label}>Company</Text>
        <Text style={styles.value}>{company?.name || '—'}</Text>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.name || user?.email || '—'}</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{role}</Text>
        </View>
      </View>

      <Text style={styles.note}>
        This app is read-only. Add punches, run payroll, and manage employees on the PunchPay website.
      </Text>

      <Pressable style={styles.linkBtn} onPress={() => void Linking.openURL(WEB_APP_URL)}>
        <Text style={styles.linkText}>Open punchpay.in</Text>
      </Pressable>
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
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
  },
  value: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: colors.pillBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18, paddingHorizontal: 4 },
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
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
