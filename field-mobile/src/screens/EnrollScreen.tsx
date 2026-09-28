import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { enrollFaceProfile } from '../api/field';
import { MOBILEFACE_MODEL } from '../config';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const STEPS = [
  { id: 'straight', title: 'Look straight at the camera' },
  { id: 'left', title: 'Turn slightly to your left' },
  { id: 'right', title: 'Turn slightly to your right' },
  { id: 'again', title: 'Look straight once more' },
];

type NativeFace = {
  FaceCameraView: typeof import('punchpay-face').FaceCameraView;
  FaceRecognitionEvent: import('punchpay-face').FaceRecognitionEvent;
};

function loadNativeFace(): NativeFace['FaceCameraView'] | null {
  if (Platform.OS !== 'android') return null;
  try {
    return require('punchpay-face').FaceCameraView;
  } catch {
    return null;
  }
}

type Props = {
  onDone?: () => void;
  onCancel?: () => void;
};

export default function EnrollScreen({ onDone, onCancel }: Props) {
  const { profile, refreshProfile } = useAuth();
  const FaceCameraView = useMemo(() => loadNativeFace(), []);
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [samples, setSamples] = useState<number[][]>([]);
  const [message, setMessage] = useState(STEPS[0].title);
  const [saving, setSaving] = useState(false);
  const step = STEPS[stepIndex] || STEPS[STEPS.length - 1];
  const progress = `${samples.length} of ${STEPS.length}`;

  const finish = async () => {
    await refreshProfile().catch(() => null);
    onDone?.();
  };

  if (Platform.OS !== 'android' || !FaceCameraView) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>
          Face enrollment uses the on-device MobileFaceNet module, which is available in the Android
          PunchPay Field build. Expo Go and iOS cannot register a face yet.
        </Text>
        {onCancel ? (
          <Pressable onPress={onCancel}>
            <Text style={styles.cancel}>Back</Text>
          </Pressable>
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
        <Text style={styles.help}>Camera access is required to register your face.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FaceCameraView
        style={StyleSheet.absoluteFill}
        active={!saving}
        mode="enroll"
        enrollStep={step.id}
        onRecognition={(event) => {
          const payload = event.nativeEvent;
          if (saving) return;
          if (payload.type === 'status' && payload.message) {
            setMessage(payload.message);
            return;
          }
          if (payload.type !== 'sample' || payload.step !== step.id || !payload.embedding) return;
          const next = [...samples, payload.embedding];
          setSamples(next);
          if (next.length < STEPS.length) {
            setStepIndex(next.length);
            setMessage(STEPS[next.length].title);
            return;
          }
          setSaving(true);
          setMessage('Saving face registration…');
          enrollFaceProfile({
            model: MOBILEFACE_MODEL,
            dimension: payload.dimension || payload.embedding.length,
            embeddings: next,
          })
            .then(async () => {
              setMessage('Face registered');
              await finish();
            })
            .catch((err: Error) => {
              setSaving(false);
              setSamples([]);
              setStepIndex(0);
              setMessage(err.message || 'Face registration failed');
            });
        }}
      />
      <View style={styles.header}>
        <Text style={styles.title}>Register {profile?.employee.name || 'your face'}</Text>
        <Text style={styles.sub}>
          {profile?.employee.employee_code ? `Code: ${profile.employee.employee_code}` : ''}
        </Text>
        <Text style={styles.sub}>
          {progress} · {step.title}
        </Text>
      </View>
      <View style={styles.footer}>
        {saving ? <ActivityIndicator color="#fff" /> : null}
        <Text style={styles.status}>{message}</Text>
        {onCancel ? (
          <Pressable disabled={saving} onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg, gap: 16 },
  help: { fontSize: 15, color: colors.text, lineHeight: 22, textAlign: 'center' },
  header: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sub: { color: '#cbd5e1', marginTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 10,
  },
  status: { color: '#fff', textAlign: 'center' },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonText: { color: '#0A0A0A', fontWeight: '700' },
  cancel: { color: '#fda4af', fontWeight: '600', marginTop: 8, textAlign: 'center' },
});
