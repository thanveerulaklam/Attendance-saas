import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { submitFieldPunch } from '../api/field';
import type { ApiError, MeResponse } from '../api/types';
import { MAX_GPS_ACCURACY_M, MOBILEFACE_MATCH_THRESHOLD } from '../config';
import { messageForRejectCode } from '../constants/rejectMessages';
import { useAuth } from '../context/AuthContext';
import { findMatchingFieldSite, nearestFieldSite } from '../geo';
import { loadNativeFace, nativeFaceError } from '../nativeFace';
import { colors, statusLabel } from '../theme';

type PunchType = 'in' | 'out';

export default function PunchCamera({ profile }: { profile: MeResponse }) {
  const { refreshProfile } = useAuth();
  const nativeFace = loadNativeFace();
  const [permission, requestPermission] = useCameraPermissions();
  const [locStatus, setLocStatus] = useState<string>('Checking GPS…');
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [message, setMessage] = useState('Look at the camera to confirm your face');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [punchFeedback, setPunchFeedback] = useState<string | null>(null);
  const [faceReady, setFaceReady] = useState(false);
  const punchingRef = useRef(false);
  const embeddingRef = useRef<number[] | undefined>(undefined);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const sites = profile.sites || [];
  const match = coords
    ? findMatchingFieldSite(coords.latitude, coords.longitude, sites)
    : null;
  const nearest = coords ? nearestFieldSite(coords.latitude, coords.longitude, sites) : null;
  const gpsOk = Boolean(coords && coords.accuracy <= MAX_GPS_ACCURACY_M);
  const locationOk = Boolean(match);
  const canPunch = faceReady && locationOk && !busy;
  const todayStatus = profile.today?.status || 'not_checked_in';
  const suggested: PunchType = todayStatus === 'checked_in' ? 'out' : 'in';

  const loadGallery = useCallback(async () => {
    if (!nativeFace || !profile.face?.embeddings?.length || !profile.employee) return;
    const json = JSON.stringify({
      match_threshold: profile.face.match_threshold || MOBILEFACE_MATCH_THRESHOLD,
      employees: [
        {
          employee_id: profile.employee.id,
          name: profile.employee.name,
          employee_code: profile.employee.employee_code,
          embeddings: profile.face.embeddings,
        },
      ],
    });
    await nativeFace.setFaceGallery(json);
  }, [nativeFace, profile]);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    const applyFix = (pos: Location.LocationObject | null) => {
      if (cancelled || !pos?.coords) return;
      const next = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 999,
      };
      setCoords(next);
      if (next.accuracy > MAX_GPS_ACCURACY_M) {
        setLocStatus(`GPS too coarse (±${Math.round(next.accuracy)}m). Wait a few seconds.`);
      } else {
        setLocStatus(`GPS ±${Math.round(next.accuracy)}m`);
      }
    };
    (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          if (!cancelled) setLocStatus('Turn on Location in phone settings.');
          return;
        }
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!cancelled) setLocStatus('Location permission is required.');
          return;
        }
        const accuracy =
          Platform.OS === 'android' ? Location.Accuracy.Balanced : Location.Accuracy.High;
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        applyFix(last);
        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy,
            mayShowUserSettingsDialog: true,
          });
          applyFix(current);
        } catch {
          if (!cancelled) {
            setLocStatus((current) =>
              current.startsWith('GPS') || current.includes('±')
                ? current
                : 'Waiting for GPS… stand near a window.'
            );
          }
        }
        if (cancelled) return;
        sub = await Location.watchPositionAsync(
          {
            accuracy,
            distanceInterval: 3,
            timeInterval: 1500,
          },
          applyFix
        );
        if (cancelled) {
          sub.remove();
          sub = null;
        }
      } catch (err) {
        if (!cancelled) {
          setLocStatus(err instanceof Error ? err.message : 'Could not start GPS.');
        }
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const resetFace = useCallback(() => {
    embeddingRef.current = undefined;
    setFaceReady(false);
  }, []);

  const finishPunch = useCallback(
    async (punchType: PunchType) => {
      if (punchingRef.current) return;
      const embedding = embeddingRef.current;
      if (!embedding) {
        setMessage('Look at the camera to confirm your face');
        return;
      }
      const gps = coordsRef.current;
      if (!gps) {
        setMessage('Waiting for GPS…');
        return;
      }
      const inside = findMatchingFieldSite(gps.latitude, gps.longitude, sites);
      if (!inside) {
        setMessage('You are outside every assigned site.');
        return;
      }
      punchingRef.current = true;
      setBusy(true);
      setPunchFeedback('Marking attendance…');
      try {
        const data = await submitFieldPunch({
          latitude: gps.latitude,
          longitude: gps.longitude,
          location_accuracy_m: gps.accuracy,
          punch_type: punchType,
          embedding,
        });
        const punch = data.punch;
        const summary = `${punch.punch_type.toUpperCase()} at ${new Date(punch.punch_time).toLocaleTimeString()}${
          data.site?.name ? ` · ${data.site.name}` : ''
        }`;
        setResult(summary);
        setPunchFeedback(summary);
        setMessage('Attendance marked');
        resetFace();
        await refreshProfile().catch(() => null);
      } catch (err) {
        const e = err as ApiError;
        const text =
          e.code === 'GPS_INACCURATE' && e.message
            ? e.message
            : messageForRejectCode(e.code, e.message);
        setResult(null);
        setPunchFeedback(text);
        setMessage(text);
        if (e.code === 'FACE_MISMATCH') resetFace();
      } finally {
        setBusy(false);
        punchingRef.current = false;
      }
    },
    [refreshProfile, resetFace, sites]
  );

  if (!nativeFace) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Face matching could not start on this phone.</Text>
        <Text style={styles.meta}>{nativeFaceError() || 'Native face module is unavailable.'}</Text>
        <Text style={styles.meta}>{locStatus}</Text>
        {nearest ? (
          <Text style={styles.meta}>
            Nearest: {nearest.site.name} ({Math.round(nearest.distanceM)}m)
          </Text>
        ) : null}
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Camera access is required to match your face.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  const FaceCameraView = nativeFace.FaceCameraView as any;
  const prompt = punchFeedback
    ? punchFeedback
    : result
      ? result
      : canPunch
        ? 'Face and location confirmed. Mark IN or OUT.'
        : !faceReady
          ? message
          : !gpsOk
            ? locStatus
            : 'Move inside an assigned site to mark attendance.';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <FaceCameraView
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        active={!busy}
        paused={faceReady}
        mode="recognize"
        onRecognition={(event: { nativeEvent: { type?: string; message?: string; embedding?: number[] } }) => {
          const payload = event.nativeEvent;
          if (payload.type === 'status' && payload.message && !faceReady && !punchingRef.current) {
            setMessage(payload.message);
            return;
          }
          if (payload.type !== 'match' || punchingRef.current || faceReady) return;
          if (!payload.embedding?.length) return;
          embeddingRef.current = payload.embedding;
          setFaceReady(true);
          setResult(null);
          setPunchFeedback(null);
          setMessage('Face confirmed');
        }}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.title}>{profile.employee?.name || 'Punch'}</Text>
        <Text style={styles.sub}>{statusLabel[todayStatus] || todayStatus}</Text>
        <Text style={styles.sub}>{locStatus}</Text>
        <Text style={[styles.sub, match ? styles.ok : styles.warn]}>
          {match
            ? `Inside ${match.site.name} (${Math.round(match.distanceM)}m)`
            : nearest
              ? `Outside sites · nearest ${nearest.site.name} (${Math.round(nearest.distanceM)}m)`
              : 'Waiting for GPS'}
        </Text>
        <Text style={[styles.sub, faceReady ? styles.ok : styles.warn]}>
          {faceReady ? 'Face confirmed' : 'Waiting for face'}
        </Text>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 8 }} /> : null}
        <Text style={styles.status}>{prompt}</Text>
        <View style={styles.actions}>
          <Pressable
            disabled={!canPunch}
            onPress={() => void finishPunch('in')}
            style={[
              styles.punchBtn,
              suggested === 'in' ? styles.punchBtnIn : styles.punchBtnMuted,
              !canPunch && styles.punchBtnDisabled,
            ]}
          >
            <Text style={styles.punchBtnText}>Mark IN</Text>
          </Pressable>
          <Pressable
            disabled={!canPunch}
            onPress={() => void finishPunch('out')}
            style={[
              styles.punchBtn,
              suggested === 'out' ? styles.punchBtnOut : styles.punchBtnMuted,
              !canPunch && styles.punchBtnDisabled,
            ]}
          >
            <Text style={styles.punchBtnText}>Mark OUT</Text>
          </Pressable>
        </View>
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
    gap: 16,
  },
  help: { fontSize: 16, color: colors.text, lineHeight: 22, textAlign: 'center' },
  meta: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 16,
    padding: 16,
    zIndex: 20,
    elevation: 20,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sub: { color: '#cbd5e1', marginTop: 4, fontSize: 13 },
  ok: { color: '#6ee7b7' },
  warn: { color: '#fcd34d' },
  status: { color: '#fff', marginTop: 10, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  punchBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  punchBtnIn: { backgroundColor: '#059669', borderColor: '#059669' },
  punchBtnOut: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  punchBtnMuted: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.4)' },
  punchBtnDisabled: { opacity: 0.38 },
  punchBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#0A0A0A', fontWeight: '700', fontSize: 16 },
});
