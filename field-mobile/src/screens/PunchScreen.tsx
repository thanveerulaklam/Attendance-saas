import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { submitFieldPunch } from '../api/field';
import type { ApiError } from '../api/types';
import { MAX_GPS_ACCURACY_M, MOBILEFACE_MATCH_THRESHOLD } from '../config';
import { messageForRejectCode } from '../constants/rejectMessages';
import { useAuth } from '../context/AuthContext';
import { findMatchingFieldSite, nearestFieldSite } from '../geo';
import type { RootStackParamList } from '../navigation/types';
import { colors, statusLabel } from '../theme';

type NativeFace = {
  FaceCameraView: typeof import('punchpay-face').FaceCameraView;
  setFaceGallery: typeof import('punchpay-face').setFaceGallery;
};

function loadNativeFace(): NativeFace | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = require('punchpay-face') as NativeFace;
    if (!mod?.FaceCameraView || !mod?.setFaceGallery) return null;
    return mod;
  } catch {
    return null;
  }
}

export default function PunchScreen() {
  const { profile, refreshProfile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const nativeFace = useMemo(() => loadNativeFace(), []);
  const [permission, requestPermission] = useCameraPermissions();
  const [locStatus, setLocStatus] = useState<string>('Checking GPS…');
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [message, setMessage] = useState('Look at the camera to punch');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const punchingRef = useRef(false);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const sites = profile?.sites || [];
  const enrolled = Boolean(profile?.enrolled && profile.face?.embeddings?.length);
  const match = coords
    ? findMatchingFieldSite(coords.latitude, coords.longitude, sites)
    : null;
  const nearest = coords ? nearestFieldSite(coords.latitude, coords.longitude, sites) : null;

  const loadGallery = useCallback(async () => {
    if (!nativeFace || !profile?.face?.embeddings?.length || !profile.employee) return;
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

  useFocusEffect(
    useCallback(() => {
      void refreshProfile().catch(() => null);
    }, [refreshProfile])
  );

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (!cancelled) setLocStatus('Location permission is required.');
        return;
      }
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (pos) => {
          if (cancelled) return;
          const next = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 999,
          };
          setCoords(next);
          if (next.accuracy > MAX_GPS_ACCURACY_M) {
            setLocStatus(`GPS too weak (±${Math.round(next.accuracy)}m). Move outdoors.`);
          } else {
            setLocStatus(`GPS ±${Math.round(next.accuracy)}m`);
          }
        }
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const finishPunch = useCallback(
    async (embedding?: number[]) => {
      if (punchingRef.current) return;
      const gps = coordsRef.current;
      if (!gps) {
        setMessage('Waiting for GPS…');
        return;
      }
      if (gps.accuracy > MAX_GPS_ACCURACY_M) {
        setMessage(`GPS too weak (±${Math.round(gps.accuracy)}m). Move outdoors.`);
        return;
      }
      const inside = findMatchingFieldSite(gps.latitude, gps.longitude, sites);
      if (!inside) {
        setMessage('You are outside every assigned site.');
        return;
      }
      punchingRef.current = true;
      setBusy(true);
      try {
        const data = await submitFieldPunch({
          latitude: gps.latitude,
          longitude: gps.longitude,
          location_accuracy_m: gps.accuracy,
          embedding,
        });
        const punch = data.punch;
        setResult(
          `${punch.punch_type.toUpperCase()} at ${new Date(punch.punch_time).toLocaleTimeString()}${
            data.site?.name ? ` · ${data.site.name}` : ''
          }`
        );
        setMessage('Attendance marked');
        await refreshProfile().catch(() => null);
      } catch (err) {
        const e = err as ApiError;
        setResult(null);
        setMessage(messageForRejectCode(e.code, e.message));
      } finally {
        setBusy(false);
        punchingRef.current = false;
      }
    },
    [refreshProfile, sites]
  );

  if (!profile?.company.field_attendance_enabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Field attendance is not enabled for your company. Contact HR.</Text>
      </View>
    );
  }

  if (!sites.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>No field sites are assigned to you. Contact HR.</Text>
      </View>
    );
  }

  if (!enrolled) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Register your face once before punching. This stays on your profile.</Text>
        <Pressable style={styles.button} onPress={() => navigation.navigate('Enroll')}>
          <Text style={styles.buttonText}>Register face</Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS !== 'android' || !nativeFace) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>
          Face matching runs on-device with MobileFaceNet and is available in the Android PunchPay Field
          build. Expo Go and iOS cannot punch yet.
        </Text>
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

  const FaceCameraView = nativeFace.FaceCameraView;
  const todayStatus = profile.today?.status || 'not_checked_in';

  return (
    <View style={styles.container}>
      <FaceCameraView
        style={StyleSheet.absoluteFill}
        active={!busy}
        mode="recognize"
        onRecognition={(event) => {
          const payload = event.nativeEvent;
          if (payload.type === 'status' && payload.message && !punchingRef.current) {
            setMessage(payload.message);
            return;
          }
          if (payload.type !== 'match' || punchingRef.current) return;
          void finishPunch(payload.embedding);
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>{profile.employee.name}</Text>
        <Text style={styles.sub}>{statusLabel[todayStatus] || todayStatus}</Text>
        <Text style={styles.sub}>{locStatus}</Text>
        <Text style={[styles.sub, match ? styles.ok : styles.warn]}>
          {match
            ? `Inside ${match.site.name} (${Math.round(match.distanceM)}m)`
            : nearest
              ? `Outside sites · nearest ${nearest.site.name} (${Math.round(nearest.distanceM)}m)`
              : 'Waiting for GPS'}
        </Text>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 8 }} /> : null}
        <Text style={styles.status}>{result || message}</Text>
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
    bottom: 28,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 16,
    padding: 16,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sub: { color: '#cbd5e1', marginTop: 4, fontSize: 13 },
  ok: { color: '#6ee7b7' },
  warn: { color: '#fcd34d' },
  status: { color: '#fff', marginTop: 10, fontWeight: '600' },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#0A0A0A', fontWeight: '700', fontSize: 16 },
});
