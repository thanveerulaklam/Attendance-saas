import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FaceCameraView, type FaceRecognitionEvent } from 'punchpay-face';
import { colors } from '../theme';

type Props = {
  onClose: () => void;
};

export default function FaceCalibrateCamera({ onClose }: Props) {
  const [line, setLine] = useState('Look at the camera');

  return (
    <View style={styles.container}>
      <FaceCameraView
        style={StyleSheet.absoluteFill}
        active
        mode="calibrate"
        onRecognition={(event: { nativeEvent: FaceRecognitionEvent }) => {
          const payload = event.nativeEvent;
          if (payload.type === 'status' && payload.message) {
            setLine(payload.message);
            return;
          }
          if (payload.type !== 'calibration') return;
          const decision = payload.matched ? 'MATCH' : 'NO MATCH';
          setLine(
            `${payload.name || 'Unknown'}  ${Number(payload.similarity || 0).toFixed(3)}  threshold ${Number(payload.threshold || 0).toFixed(3)}  ${decision}\ninference ${payload.inferenceMs ?? 0} ms  total ${payload.totalMs ?? 0} ms`
          );
        }}
      />
      <View style={styles.footer}>
        <Text style={styles.line}>{line}</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    backgroundColor: 'rgba(15,23,42,0.92)',
    gap: 12,
  },
  line: { color: '#fff', fontSize: 16, textAlign: 'center' },
  close: { color: colors.brand, textAlign: 'center', fontWeight: '700' },
});
