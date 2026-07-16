import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { recognizeKioskFace, submitKioskPunch } from '../api/kiosk';
import { colors } from '../theme';

const SCAN_INTERVAL_MS = 1000;

type Props = {
  active: boolean;
  companyName?: string;
  branchName?: string;
  enrolledCount?: number;
  duplicatePunchSeconds?: number;
  minRecognizeSeconds?: number;
  onPunchRecorded?: () => void;
};

export default function KioskPunchScreen({
  active,
  companyName,
  branchName,
  enrolledCount = 0,
  duplicatePunchSeconds = 90,
  minRecognizeSeconds = 2,
  onPunchRecorded,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    enrolledCount > 0 ? 'Ready — look at the camera' : 'Open Settings and enroll employees first'
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const processingRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const holdRef = useRef<{ employeeId: number; name: string; startedAt: number } | null>(null);
  const successPauseMs = Math.max(6000, Number(duplicatePunchSeconds || 90) * 1000);
  const requiredHoldMs = Math.max(0, Number(minRecognizeSeconds || 0) * 1000);

  const resetHold = useCallback(() => {
    holdRef.current = null;
    setHoldProgress(0);
  }, []);

  const scan = useCallback(async () => {
    if (
      !active ||
      enrolledCount <= 0 ||
      !cameraReady ||
      processingRef.current ||
      !cameraRef.current ||
      Date.now() < pausedUntilRef.current
    ) {
      return;
    }

    processingRef.current = true;
    try {
      setBusy(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        skipProcessing: true,
      });
      if (!photo?.base64) {
        throw new Error('Could not capture photo');
      }

      const recognized = await recognizeKioskFace(photo.base64);
      const employeeId = Number(recognized.employee.id);
      const now = Date.now();
      const hold = holdRef.current;

      if (!hold || hold.employeeId !== employeeId) {
        holdRef.current = {
          employeeId,
          name: recognized.employee.name,
          startedAt: now,
        };
        setHoldProgress(0);
        setMessage(
          requiredHoldMs > 0
            ? `Hi ${recognized.employee.name} — hold still…`
            : `Recognized ${recognized.employee.name}`
        );
        if (requiredHoldMs > 0) {
          return;
        }
      }

      const elapsed = now - (holdRef.current?.startedAt || now);
      const progress = requiredHoldMs > 0 ? Math.min(1, elapsed / requiredHoldMs) : 1;
      setHoldProgress(progress);

      if (elapsed < requiredHoldMs) {
        const remaining = Math.ceil((requiredHoldMs - elapsed) / 1000);
        setMessage(`Hi ${recognized.employee.name} — hold still ${remaining}s`);
        return;
      }

      setMessage('Marking attendance…');
      const result = await submitKioskPunch(photo.base64);
      resetHold();
      pausedUntilRef.current = Date.now() + successPauseMs;
      setSuccess(
        `${result.employee.name} — ${result.punch.punch_type.toUpperCase()} at ${new Date(
          result.punch.punch_time
        ).toLocaleTimeString()}`
      );
      setMessage('Attendance marked — next employee please');
      onPunchRecorded?.();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'FACE_NOT_DETECTED' || e.code === 'FACE_NOT_RECOGNIZED') {
        resetHold();
        setMessage('Ready — look at the camera');
      } else if (e.code === 'DUPLICATE_PUNCH') {
        resetHold();
        setMessage('Attendance already marked — next employee please');
        pausedUntilRef.current = Date.now() + successPauseMs;
      } else {
        resetHold();
        setMessage(e.message || 'Face not recognized');
        pausedUntilRef.current = Date.now() + 2500;
      }
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  }, [
    active,
    cameraReady,
    enrolledCount,
    onPunchRecorded,
    requiredHoldMs,
    resetHold,
    successPauseMs,
  ]);

  useEffect(() => {
    if (enrolledCount <= 0) {
      setMessage('Open Settings and enroll employees first');
    } else if (!success) {
      setMessage('Ready — look at the camera');
    }
  }, [enrolledCount, success]);

  useEffect(() => {
    if (!active || !cameraReady) return undefined;
    const timer = setInterval(() => {
      scan();
    }, SCAN_INTERVAL_MS);
    scan();
    return () => clearInterval(timer);
  }, [active, cameraReady, scan]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(null), successPauseMs);
    return () => clearTimeout(timer);
  }, [success, successPauseMs]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.info}>Camera access is required for face attendance.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={[styles.header, { top: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.company}>{companyName}</Text>
        <Text style={styles.branch}>{branchName}</Text>
        <Text style={styles.hint}>
          {enrolledCount} faces enrolled
          {minRecognizeSeconds > 0 ? ` · hold ${minRecognizeSeconds}s to punch` : ''}
        </Text>
      </View>

      <View style={styles.footer}>
        {busy && <ActivityIndicator color="#fff" size="large" />}
        {!success && holdProgress > 0 && requiredHoldMs > 0 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(holdProgress * 100)}%` }]} />
          </View>
        ) : null}
        <Text style={success ? styles.success : styles.status}>{message}</Text>
        {success ? <Text style={styles.success}>{success}</Text> : null}
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
    backgroundColor: '#f8fafc',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  company: { color: '#fff', fontSize: 22, fontWeight: '700' },
  branch: { color: '#cbd5e1', fontSize: 14, marginTop: 4 },
  hint: { color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center',
    gap: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  status: { color: '#e2e8f0', textAlign: 'center', fontSize: 15 },
  success: { color: '#86efac', textAlign: 'center', fontWeight: '600', fontSize: 15 },
  info: { textAlign: 'center', color: '#64748b', marginBottom: 12 },
  btn: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
