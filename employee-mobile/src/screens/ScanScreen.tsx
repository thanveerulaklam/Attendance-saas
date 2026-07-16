import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { submitPunch } from '../api/attendance';
import { messageForRejectCode } from '../constants/rejectMessages';
import type { ApiError } from '../api/types';
import type { RootStackParamList } from '../navigation/types';
import { MAX_GPS_ACCURACY_M } from '../config';
import { colors } from '../theme';

function parseNonceFromQr(data: string): string | null {
  const trimmed = String(data || '').trim();
  if (!trimmed) return null;

  // Bare hex nonce (preferred kiosk format)
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return trimmed.toLowerCase();

  // Structured JSON payload: { nonce: "..." }
  try {
    let parsed: unknown = JSON.parse(trimmed);
    // Handle accidental double-encoding
    if (typeof parsed === 'string') {
      if (/^[a-f0-9]{32,}$/i.test(parsed.trim())) return parsed.trim().toLowerCase();
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === 'object' && 'nonce' in parsed) {
      const nonce = String((parsed as { nonce: unknown }).nonce || '').trim();
      if (/^[a-f0-9]{32,}$/i.test(nonce)) return nonce.toLowerCase();
      if (nonce) return nonce;
    }
  } catch {
    // fall through
  }

  // Last resort: extract "nonce":"..." from a partial/corrupted JSON scan
  const match = trimmed.match(/"nonce"\s*:\s*"([a-f0-9]{32,})"/i);
  if (match?.[1]) return match[1].toLowerCase();

  return null;
}

export default function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [permission, requestPermission] = useCameraPermissions();
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const scannedRef = useRef(false);

  const ensureLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const ok = status === 'granted';
    setLocationGranted(ok);
    return ok;
  }, []);

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      if (busy || scannedRef.current) return;
      const nonce = parseNonceFromQr(data);
      if (!nonce) {
        setMessage('Invalid QR code. Use the office attendance display.');
        return;
      }

      scannedRef.current = true;
      setBusy(true);
      setMessage(null);
      setSuccess(null);

      try {
        const locOk = await ensureLocation();
        if (!locOk) {
          throw Object.assign(new Error('Location permission denied'), { code: 'GPS_DENIED' });
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const accuracy = pos.coords.accuracy ?? 999;
        if (accuracy > MAX_GPS_ACCURACY_M) {
          throw Object.assign(
            new Error(`GPS accuracy ${Math.round(accuracy)}m is too low`),
            { code: 'GPS_INACCURATE' }
          );
        }

        const result = await submitPunch({
          qr_nonce: nonce,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          location_accuracy_m: accuracy,
        });

        setSuccess(
          `Punch ${result.punch.punch_type.toUpperCase()} recorded at ${new Date(
            result.punch.punch_time
          ).toLocaleTimeString()}`
        );
        setTimeout(() => navigation.goBack(), 2000);
      } catch (err) {
        const e = err as ApiError;
        setMessage(messageForRejectCode(e.code, e.message));
        scannedRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureLocation, navigation]
  );

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.info}>Camera access is required to scan the office QR code.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : handleBarcode}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>Scan office QR</Text>
        <Text style={styles.sub}>
          Point at the QR on the reception tablet. GPS must be on.
        </Text>
        {locationGranted === false && (
          <Text style={styles.warn}>Enable location in settings</Text>
        )}
        {busy && <ActivityIndicator color="#fff" size="large" style={{ marginTop: 16 }} />}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
        <Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={busy}>
          <Text style={styles.cancelText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 40,
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sub: { color: '#cbd5e1', fontSize: 13, marginTop: 6 },
  warn: { color: '#fca5a5', marginTop: 8, fontSize: 13 },
  error: { color: '#fca5a5', marginTop: 12, fontSize: 14 },
  success: { color: '#86efac', marginTop: 12, fontSize: 14, fontWeight: '600' },
  info: { textAlign: 'center', color: colors.muted, marginBottom: 16 },
  btn: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: colors.primary },
  cancel: { marginTop: 20, alignItems: 'center' },
  cancelText: { color: '#94a3b8', fontSize: 15 },
});
