import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKiosk } from '../context/KioskContext';
import { normalizeKioskCode } from '../api/kiosk';
import { API_BASE } from '../config';
import { colors } from '../theme';

export default function ActivateScreen() {
  const { activate } = useKiosk();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onActivate = async () => {
    if (!code.trim() || busy) return;
    try {
      setBusy(true);
      setError(null);
      await activate(code.trim());
    } catch (err) {
      setError((err as Error).message || 'Invalid kiosk code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={styles.title}>PunchPay Kiosk</Text>
      <Text style={styles.sub}>
        Enter the 8-character kiosk code from Company settings. You only need to do this once on this tablet.
      </Text>

      <TextInput
        value={code}
        onChangeText={(value) => setCode(normalizeKioskCode(value))}
        placeholder="AB12CD34"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.btn} onPress={onActivate} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Activate tablet</Text>
        )}
      </Pressable>

      <Text style={styles.meta}>Server: {API_BASE}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  sub: { marginTop: 8, fontSize: 14, color: colors.muted, lineHeight: 20 },
  input: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  error: { marginTop: 10, color: colors.danger, fontSize: 13 },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  meta: { marginTop: 20, fontSize: 11, color: colors.muted, textAlign: 'center' },
});
