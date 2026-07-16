import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KioskProvider, useKiosk } from './src/context/KioskContext';
import ActivateScreen from './src/screens/ActivateScreen';
import KioskPunchScreen from './src/screens/KioskPunchScreen';
import KioskSettingsScreen from './src/screens/KioskSettingsScreen';
import KioskSettingsUnlockScreen from './src/screens/KioskSettingsUnlockScreen';
import { setActiveKioskSettingsPin } from './src/api/kiosk';
import { useKioskKeepAwake } from './src/hooks/useKioskKeepAwake';
import { colors } from './src/theme';

function Root() {
  const { token, session, loading, refresh } = useKiosk();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'attendance' | 'settings'>('attendance');
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!token) {
    return <ActivateScreen />;
  }

  return (
    <View style={styles.app}>
      <StatusBar style={tab === 'attendance' ? 'light' : 'dark'} />
      <View style={styles.screen}>
        {tab === 'attendance' ? (
          <KioskPunchScreen
            active
            companyName={session?.company.name}
            branchName={session?.branch.name}
            enrolledCount={session?.enrolled_count}
            duplicatePunchSeconds={session?.preferences?.duplicate_punch_seconds}
            minRecognizeSeconds={session?.preferences?.min_recognize_seconds}
            onPunchRecorded={refresh}
          />
        ) : settingsUnlocked ? (
          <KioskSettingsScreen />
        ) : (
          <KioskSettingsUnlockScreen onUnlocked={() => setSettingsUnlocked(true)} />
        )}
      </View>
      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Pressable
          style={[styles.tabButton, tab === 'attendance' && styles.tabButtonActive]}
          onPress={() => {
            setTab('attendance');
            setSettingsUnlocked(false);
            setActiveKioskSettingsPin(null);
          }}
        >
          <Text style={[styles.tabText, tab === 'attendance' && styles.tabTextActive]}>
            Attendance
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'settings' && styles.tabButtonActive]}
          onPress={() => setTab('settings')}
        >
          <Text style={[styles.tabText, tab === 'settings' && styles.tabTextActive]}>
            Settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  useKioskKeepAwake(true);

  return (
    <SafeAreaProvider>
      <KioskProvider>
        <Root />
      </KioskProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
  },
  tabButtonActive: { backgroundColor: colors.brand },
  tabText: { color: colors.muted, fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  tabTextActive: { color: '#0A0A0A' },
});
