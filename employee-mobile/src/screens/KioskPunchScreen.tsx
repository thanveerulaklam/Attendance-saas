import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { FaceCameraView, setFaceGallery, type FaceRecognitionEvent } from 'punchpay-face';
import { fetchMobileFaceProfiles } from '../api/kiosk';
import KioskUpdateNotice from '../components/KioskUpdateNotice';
import { FACE_ENGINE } from '../face/engine';
import { flushPunchQueue, markKioskPunchOrQueue } from '../face/punchQueue';
import type { KioskAppUpdate } from '../updates/useKioskAppUpdate';
import { colors } from '../theme';
import KioskPunchLegacyScreen from './KioskPunchLegacyScreen';

const GALLERY_FILE = `${FileSystem.documentDirectory || ''}punchpay-face-profiles.json`;

type Props = {
  active: boolean;
  companyName?: string;
  branchName?: string;
  enrolledCount?: number;
  duplicatePunchSeconds?: number;
  minRecognizeSeconds?: number;
  onPunchRecorded?: () => void;
  appUpdate?: KioskAppUpdate;
};

export default function KioskPunchScreen(props: Props) {
  if (FACE_ENGINE === 'legacy_face_api') {
    return <KioskPunchLegacyScreen {...props} />;
  }
  return <MobileFacePunchScreen {...props} />;
}

function MobileFacePunchScreen({
  active,
  companyName,
  branchName,
  duplicatePunchSeconds = 90,
  minRecognizeSeconds = 0,
  onPunchRecorded,
  appUpdate,
}: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState('Preparing face recognition…');
  const [success, setSuccess] = useState<string | null>(null);
  const [profileCount, setProfileCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [timings, setTimings] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  const holdRef = useRef<{ employeeId: number; name: string; startedAt: number } | null>(null);
  const punchingRef = useRef(false);
  const cooldownUntilRef = useRef(new Map<number, number>());
  const resultUntilRef = useRef(0);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requiredHoldMs = Math.max(0, Number(minRecognizeSeconds || 0) * 1000);
  const duplicateWindowMs = Math.max(1, Number(duplicatePunchSeconds || 90)) * 1000;

  const loadProfiles = useCallback(async () => {
    let json = '';
    try {
      const remote = await fetchMobileFaceProfiles();
      json = JSON.stringify(remote);
      if (GALLERY_FILE) {
        await FileSystem.writeAsStringAsync(GALLERY_FILE, json);
      }
    } catch {
      if (GALLERY_FILE) {
        const info = await FileSystem.getInfoAsync(GALLERY_FILE);
        if (info.exists) json = await FileSystem.readAsStringAsync(GALLERY_FILE);
      }
    }
    if (!json) {
      setProfileCount(0);
      setMessage('Face registration required. Open Settings and register employees.');
      return;
    }
    let parsed: { employees?: unknown[] };
    try {
      parsed = JSON.parse(json) as { employees?: unknown[] };
      const count = parsed.employees?.length || 0;
      setProfileCount(count);
      await setFaceGallery(json);
      if (count === 0) {
        setMessage('Face registration required. Open Settings and register employees.');
      }
      return;
    } catch {
      setProfileCount(0);
      setMessage('Face registration required. Open Settings and register employees.');
      return;
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    loadProfiles();
    const timer = setInterval(loadProfiles, 60000);
    return () => clearInterval(timer);
  }, [active, loadProfiles]);

  useEffect(() => () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
  }, []);

  const showResult = useCallback((status: string, detail: string | null) => {
    setMessage(status);
    setSuccess(detail);
    resultUntilRef.current = Date.now() + 2500;
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      resultUntilRef.current = 0;
      setSuccess(null);
      setMessage((current) => (current === status ? 'Ready — look at the camera' : current));
    }, 2500);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    flushPunchQueue().catch(() => undefined);
    const timer = setInterval(() => {
      flushPunchQueue().catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [active]);

  const finishPunch = useCallback(async (employeeId: number, name: string) => {
    if (punchingRef.current) return;
    const cooldownUntil = cooldownUntilRef.current.get(employeeId) || 0;
    if (Date.now() < cooldownUntil) {
      if (Date.now() >= resultUntilRef.current) {
        showResult('Attendance already marked — next employee please', null);
      }
      return;
    }
    punchingRef.current = true;
    setBusy(true);
    try {
      const outcome = await markKioskPunchOrQueue(employeeId);
      holdRef.current = null;
      setHoldProgress(0);
      cooldownUntilRef.current.set(employeeId, Date.now() + duplicateWindowMs);
      if (outcome.queued) {
        showResult(
          'Attendance saved offline',
          `${name} — saved on this tablet. It will sync when the network is back.`
        );
      } else if (outcome.data) {
        const punch = outcome.data.punch;
        showResult(
          'Attendance marked — next employee please',
          `${outcome.data.employee.name} — ${punch.punch_type.toUpperCase()} at ${new Date(
            punch.punch_time
          ).toLocaleTimeString()}`
        );
        onPunchRecorded?.();
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      holdRef.current = null;
      setHoldProgress(0);
      if (error.code === 'DUPLICATE_PUNCH') {
        cooldownUntilRef.current.set(employeeId, Date.now() + duplicateWindowMs);
        showResult('Attendance already marked — next employee please', null);
      } else {
        resultUntilRef.current = 0;
        setSuccess(null);
        setMessage(error.message || 'Could not mark attendance');
      }
    } finally {
      setBusy(false);
      punchingRef.current = false;
    }
  }, [duplicateWindowMs, onPunchRecorded, showResult]);

  const onRecognition = useCallback((event: { nativeEvent: FaceRecognitionEvent }) => {
    const payload = event.nativeEvent;
    if (payload.type === 'status' && payload.message && !punchingRef.current) {
      if (Date.now() < resultUntilRef.current) return;
      if (!holdRef.current) setMessage(payload.message);
      if (payload.message.startsWith('Ready') || payload.message.startsWith('Only one')) {
        holdRef.current = null;
        setHoldProgress(0);
      }
      return;
    }
    if (payload.type !== 'match' || !payload.employeeId || punchingRef.current) return;
    if (__DEV__) {
      setTimings(
        `detect ${payload.detectionMs ?? 0}ms · crop ${payload.cropMs ?? 0}ms · model ${payload.inferenceMs ?? 0}ms · match ${payload.matchingMs ?? 0}ms · total ${payload.totalMs ?? 0}ms`
      );
    }
    const startedAt = Date.now();
    if (requiredHoldMs <= 0) {
      finishPunch(payload.employeeId, payload.name || 'Employee');
      return;
    }
    holdRef.current = {
      employeeId: payload.employeeId,
      name: payload.name || 'Employee',
      startedAt,
    };
    setMessage(`Hi ${payload.name || 'there'} — hold still…`);
  }, [finishPunch, requiredHoldMs]);

  useEffect(() => {
    if (!active || requiredHoldMs <= 0) return undefined;
    const timer = setInterval(() => {
      const hold = holdRef.current;
      if (!hold || punchingRef.current) return;
      const elapsed = Date.now() - hold.startedAt;
      setHoldProgress(Math.min(1, elapsed / requiredHoldMs));
      if (elapsed >= requiredHoldMs) {
        finishPunch(hold.employeeId, hold.name);
      } else {
        const remaining = Math.ceil((requiredHoldMs - elapsed) / 1000);
        setMessage(`Hi ${hold.name} — hold still ${remaining}s`);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [active, finishPunch, requiredHoldMs]);

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
      <FaceCameraView
        style={StyleSheet.absoluteFill}
        active={active && profileCount > 0}
        mode="recognize"
        paused={profileCount === 0}
        onRecognition={onRecognition}
      />
      <View style={[styles.header, { top: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.company}>{companyName}</Text>
        <Text style={styles.branch}>{branchName}</Text>
        <Text style={styles.hint}>
          {profileCount} faces registered
          {minRecognizeSeconds > 0 ? ` · hold ${minRecognizeSeconds}s to punch` : ''}
        </Text>
      </View>
      <View style={styles.footer}>
        {busy ? <ActivityIndicator color="#fff" size="large" /> : null}
        {!success && holdProgress > 0 && requiredHoldMs > 0 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(holdProgress * 100)}%` }]} />
          </View>
        ) : null}
        {appUpdate ? <KioskUpdateNotice update={appUpdate} variant="banner" /> : null}
        <Text style={success ? styles.success : styles.status}>{message}</Text>
        {success ? <Text style={styles.success}>{success}</Text> : null}
        {__DEV__ && timings ? <Text style={styles.hint}>{timings}</Text> : null}
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
