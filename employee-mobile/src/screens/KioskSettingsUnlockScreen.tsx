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
import { verifyKioskSettingsPin } from '../api/kiosk';
import { colors } from '../theme';

export default function KioskSettingsUnlockScreen({
  onUnlocked,
}: {
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!/^\d{6}$/.test(pin) || busy) {
      setError('Enter the 6-digit Settings PIN.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await verifyKioskSettingsPin(pin);
      onUnlocked();
    } catch (err) {
      setError((err as Error).message || 'Incorrect Settings PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={styles.title}>Settings locked</Text>
      <Text style={styles.help}>
        Enter the 6-digit PIN shown when this branch kiosk was created.
      </Text>
      <TextInput
        value={pin}
        onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="••••••"
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} disabled={busy} onPress={unlock}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Unlock settings</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  help: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    backgroundColor: '#fff',
  },
  error: { marginTop: 10, color: colors.danger, fontSize: 12 },
  button: {
    marginTop: 16,
    alignItems: 'center',
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.primary,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
