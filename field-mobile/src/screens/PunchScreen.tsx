import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

type Props = {
  onEnroll?: () => void;
};

export default function PunchScreen({ onEnroll }: Props) {
  const { profile, refreshProfile } = useAuth();
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    void refreshProfile().catch(() => null);
  }, [refreshProfile]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCameraReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile.company?.field_attendance_enabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Field attendance is not enabled for your company. Contact HR.</Text>
      </View>
    );
  }

  const sites = profile.sites || [];
  const beatEnabled = Boolean(profile.employee?.field_beat_enabled);
  if (!beatEnabled && !sites.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>No field sites are assigned to you. Contact HR.</Text>
      </View>
    );
  }

  const enrolled = Boolean(profile.enrolled && profile.face?.embeddings?.length);
  if (!enrolled) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Register your face once before punching. This stays on your profile.</Text>
        <Pressable style={styles.button} onPress={() => onEnroll?.()}>
          <Text style={styles.buttonText}>Register face</Text>
        </Pressable>
      </View>
    );
  }

  if (!cameraReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const Camera = beatEnabled
    ? (require('./BeatCamera').default as typeof import('./BeatCamera').default)
    : (require('./PunchCamera').default as typeof import('./PunchCamera').default);
  return <Camera profile={profile} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
    gap: 16,
  },
  help: { fontSize: 16, color: colors.text, lineHeight: 22, textAlign: 'center' },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#0A0A0A', fontWeight: '700', fontSize: 16 },
});
