import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { FaceCameraView, type FaceRecognitionEvent } from 'punchpay-face';
import { enrollKioskFaceProfile } from '../api/kiosk';
import { MOBILEFACE_MODEL } from '../face/engine';
import { colors } from '../theme';

const STEPS = [
  { id: 'straight', title: 'Look straight at the camera' },
  { id: 'left', title: 'Turn slightly to your left' },
  { id: 'right', title: 'Turn slightly to your right' },
  { id: 'again', title: 'Look straight once more' },
];

type Props = {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  onDone: (message: string) => void;
  onCancel: () => void;
};

export default function FaceEnrollCamera({
  employeeId,
  employeeName,
  employeeCode,
  onDone,
  onCancel,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [samples, setSamples] = useState<number[][]>([]);
  const [message, setMessage] = useState(STEPS[0].title);
  const [saving, setSaving] = useState(false);
  const step = STEPS[stepIndex] || STEPS[STEPS.length - 1];
  const progress = useMemo(() => `${samples.length} of ${STEPS.length}`, [samples.length]);

  const onRecognition = (event: { nativeEvent: FaceRecognitionEvent }) => {
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
    enrollKioskFaceProfile(employeeId, {
      model: MOBILEFACE_MODEL,
      dimension: payload.dimension || payload.embedding.length,
      embeddings: next,
    })
      .then((res) => onDone(res.message || `Face registered for ${employeeName}`))
      .catch((err: Error) => {
        setSaving(false);
        setSamples([]);
        setStepIndex(0);
        setMessage(err.message || 'Face registration failed');
      });
  };

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
        <Text style={styles.help}>Camera access is required to register a face.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
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
        onRecognition={onRecognition}
      />
      <View style={styles.header}>
        <Text style={styles.title}>Register {employeeName}</Text>
        <Text style={styles.sub}>Employee code: {employeeCode}</Text>
        <Text style={styles.sub}>{progress} · {step.title}</Text>
      </View>
      <View style={styles.footer}>
        {saving ? <ActivityIndicator color="#fff" /> : null}
        <Text style={styles.status}>{message}</Text>
        <Pressable disabled={saving} onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  header: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#e2e8f0', marginTop: 6, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  status: { color: '#fff', textAlign: 'center', fontSize: 16 },
  help: { textAlign: 'center', color: colors.muted, marginBottom: 12 },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 14 },
  buttonText: { color: '#fff', fontWeight: '700' },
  cancel: { color: '#fff', fontWeight: '600' },
});
