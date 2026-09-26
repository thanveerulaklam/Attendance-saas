import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { KioskAppUpdate } from '../updates/useKioskAppUpdate';
import { colors } from '../theme';

type Props = {
  update: KioskAppUpdate;
  variant: 'banner' | 'card';
};

export default function KioskUpdateNotice({ update, variant }: Props) {
  const { status, localVersion, remoteVersion, progress, message, install } = update;
  if (variant === 'banner' && (status === 'checking' || status === 'current')) {
    return null;
  }

  const title =
    status === 'downloading'
      ? `Downloading ${remoteVersion || 'update'}… ${Math.round(progress * 100)}%`
      : status === 'ready'
        ? `Version ${remoteVersion} is ready`
        : status === 'error'
          ? 'Update did not finish'
          : status === 'current'
            ? 'This tablet is up to date'
            : 'Checking for updates…';

  const detail =
    message ||
    (status === 'ready'
      ? 'Tap Install. Android will ask you to confirm once.'
      : status === 'current'
        ? `Installed version ${localVersion}`
        : status === 'downloading'
          ? 'The new app downloads on its own. Attendance can keep running.'
          : null);

  const showButton = status === 'ready' || status === 'error';

  if (variant === 'banner') {
    return (
      <Pressable
        style={styles.banner}
        disabled={!showButton}
        onPress={showButton ? install : undefined}
      >
        {status === 'downloading' ? <ActivityIndicator color="#0A0A0A" /> : null}
        <Text style={styles.bannerText}>{showButton ? `${title}. Tap to install` : title}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>App update</Text>
      <Text style={styles.help}>{title}</Text>
      {detail ? <Text style={styles.help}>{detail}</Text> : null}
      {status === 'downloading' ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, Math.round(progress * 100))}%` }]} />
        </View>
      ) : null}
      {showButton ? (
        <Pressable style={styles.button} onPress={install}>
          <Text style={styles.buttonText}>{status === 'ready' ? 'Install update' : 'Try again'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#D4A843',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerText: { color: '#0A0A0A', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  help: { marginTop: 4, fontSize: 12, color: colors.muted, lineHeight: 17 },
  track: {
    marginTop: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.brand },
  button: {
    marginTop: 12,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#0A0A0A', fontSize: 14, fontWeight: '700' },
});
