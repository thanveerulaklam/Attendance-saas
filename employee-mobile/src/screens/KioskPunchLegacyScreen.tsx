// Legacy face-api.js path. Production uses KioskPunchScreen with FACE_ENGINE = mobilefacenet.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { fetchKioskFaceGallery, markKioskPunch } from '../api/kiosk';
import LocalFaceMatcher, {
  type FaceGallery,
  type LocalFaceMatcherHandle,
} from '../face/LocalFaceMatcher';
import KioskUpdateNotice from '../components/KioskUpdateNotice';
import type { KioskAppUpdate } from '../updates/useKioskAppUpdate';
import { colors } from '../theme';

const SCAN_INTERVAL_MS = 400;

function choosePictureSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((size) => {
      const [width, height] = size.split('x').map((part) => Number(part));
      return { size, long: Math.max(width || 0, height || 0) };
    })
    .filter((item) => item.long > 0);
  const near = parsed
    .filter((item) => item.long >= 480 && item.long <= 960)
    .sort((a, b) => Math.abs(a.long - 640) - Math.abs(b.long - 640));
  if (near[0]) return near[0].size;
  return parsed.sort((a, b) => a.long - b.long)[0]?.size;
}

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

export default function KioskPunchScreen({
  active,
  companyName,
  branchName,
  enrolledCount = 0,
  duplicatePunchSeconds = 90,
  minRecognizeSeconds = 2,
  onPunchRecorded,
  appUpdate,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    enrolledCount > 0 ? 'Ready — look at the camera' : 'Open Settings and enroll employees first'
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const processingRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const holdRef = useRef<{ employeeId: number; name: string; startedAt: number } | null>(null);
  const matcherRef = useRef<LocalFaceMatcherHandle>(null);
  const matcherReadyRef = useRef(false);
  const galleryRef = useRef<FaceGallery | null>(null);
  const [gallery, setGallery] = useState<FaceGallery | null>(null);
  const unknownUntilRef = useRef(0);
  const faceWatchRef = useRef(0);
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
    const tempUris: string[] = [];
    try {
      if (!matcherReadyRef.current || !galleryRef.current?.employees.length) {
        setMessage(
          galleryRef.current && galleryRef.current.employees.length === 0
            ? 'Open Settings and enroll employees first'
            : 'Preparing face match on this tablet…'
        );
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.5,
        shutterSound: false,
        skipProcessing: false,
      });
      if (!photo?.uri) return;
      tempUris.push(photo.uri);
      const sized = photo;

      let facePresent = false;
      let faceBox: { x: number; y: number; width: number; height: number } | undefined;
      try {
        const detectUri = Platform.OS === 'android'
          ? await FileSystem.getContentUriAsync(sized.uri)
          : sized.uri;
        const faces = await FaceDetection.detect(detectUri, {
          performanceMode: 'fast',
          landmarkMode: 'none',
          contourMode: 'none',
          classificationMode: 'none',
          minFaceSize: 0.1,
        });
        const largest = (faces || []).reduce<(typeof faces)[number] | null>((best, face) => {
          if (!best) return face;
          return face.frame.width * face.frame.height > best.frame.width * best.frame.height
            ? face
            : best;
        }, null);
        facePresent = Boolean(largest);
        if (largest) {
          faceBox = {
            x: largest.frame.left,
            y: largest.frame.top,
            width: largest.frame.width,
            height: largest.frame.height,
          };
        }
      } catch (detectErr) {
        const detectMessage = detectErr instanceof Error ? detectErr.message : '';
        if (detectMessage.includes("doesn't seem to be linked")) throw detectErr;
        facePresent = false;
      }

      if (!facePresent) {
        faceWatchRef.current += 1;
        unknownUntilRef.current = 0;
        if (holdRef.current) {
          resetHold();
          setMessage('Ready — look at the camera');
        }
        return;
      }

      const now = Date.now();
      const hold = holdRef.current;
      if (hold) {
        const elapsed = now - hold.startedAt;
        setHoldProgress(requiredHoldMs > 0 ? Math.min(1, elapsed / requiredHoldMs) : 1);
        if (elapsed < requiredHoldMs) {
          const remaining = Math.ceil((requiredHoldMs - elapsed) / 1000);
          setMessage(`Hi ${hold.name} — hold still ${remaining}s`);
          return;
        }
        setBusy(true);
        setMessage('Marking attendance…');
        const result = await markKioskPunch(hold.employeeId);
        resetHold();
        pausedUntilRef.current = Date.now() + successPauseMs;
        setSuccess(
          `${result.employee.name} — ${result.punch.punch_type.toUpperCase()} at ${new Date(
            result.punch.punch_time
          ).toLocaleTimeString()}`
        );
        setMessage('Attendance marked — next employee please');
        onPunchRecorded?.();
        return;
      }

      if (now < unknownUntilRef.current) return;

      setBusy(true);
      setMessage('Recognizing…');
      const seenAt = Date.now();
      const watch = faceWatchRef.current;
      const imageWidth = photo.width || 0;
      const imageHeight = photo.height || 0;
      const padX = (faceBox?.width || 0) * 0.45;
      const padY = (faceBox?.height || 0) * 0.55;
      const originX = Math.max(0, Math.round((faceBox?.x || 0) - padX));
      const originY = Math.max(0, Math.round((faceBox?.y || 0) - padY));
      const cropWidth = Math.max(1, Math.min(imageWidth - originX, Math.round((faceBox?.width || imageWidth) + padX * 2)));
      const cropHeight = Math.max(1, Math.min(imageHeight - originY, Math.round((faceBox?.height || imageHeight) + padY * 2)));
      const facePhoto = imageWidth > 0 && imageHeight > 0 && faceBox
        ? await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        )
        : null;
      if (facePhoto?.uri) tempUris.push(facePhoto.uri);
      if (!facePhoto?.base64) return;
      const recognized = await matcherRef.current?.match(facePhoto.base64, undefined, true);
      if (faceWatchRef.current !== watch) return;
      if (!recognized) {
        unknownUntilRef.current = Date.now() + 8000;
        setMessage('Face not recognized — try again');
        return;
      }
      const heldFor = Date.now() - seenAt;
      if (requiredHoldMs <= 0 || heldFor >= requiredHoldMs) {
        setMessage('Marking attendance…');
        const result = await markKioskPunch(recognized.employeeId);
        resetHold();
        pausedUntilRef.current = Date.now() + successPauseMs;
        setSuccess(
          `${result.employee.name} — ${result.punch.punch_type.toUpperCase()} at ${new Date(
            result.punch.punch_time
          ).toLocaleTimeString()}`
        );
        setMessage('Attendance marked — next employee please');
        onPunchRecorded?.();
        return;
      }
      holdRef.current = {
        employeeId: recognized.employeeId,
        name: recognized.name,
        startedAt: seenAt,
      };
      setHoldProgress(0);
      setMessage(`Hi ${recognized.name} — hold still…`);
    } catch (err) {
      const e = err as Error & { code?: string };
      resetHold();
      if (e.code === 'FACE_NOT_DETECTED' || e.code === 'FACE_NOT_RECOGNIZED') {
        unknownUntilRef.current = Date.now() + 8000;
        setMessage('Face not recognized — try again');
      } else if (e.code === 'DUPLICATE_PUNCH') {
        setMessage('Attendance already marked — next employee please');
        pausedUntilRef.current = Date.now() + successPauseMs;
      } else {
        setMessage(e.message || 'Face not recognized');
        pausedUntilRef.current = Date.now() + 2500;
      }
    } finally {
      for (const uri of tempUris) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
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
    if (!active) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchKioskFaceGallery();
        if (cancelled) return;
        galleryRef.current = next;
        setGallery(next);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not load enrolled faces';
          setMessage(message);
        }
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, enrolledCount]);

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
      <LocalFaceMatcher
        ref={matcherRef}
        gallery={gallery}
        onReady={() => {
          matcherReadyRef.current = true;
          setMessage('Ready — look at the camera');
        }}
        onError={(message) => {
          matcherReadyRef.current = false;
          setMessage(message);
        }}
      />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        pictureSize={pictureSize}
        animateShutter={false}
        onCameraReady={() => {
          setCameraReady(true);
          cameraRef.current?.getAvailablePictureSizesAsync().then((sizes) => {
            const next = choosePictureSize(sizes || []);
            if (next) setPictureSize(next);
          }).catch(() => undefined);
        }}
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
        {appUpdate ? <KioskUpdateNotice update={appUpdate} variant="banner" /> : null}
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
