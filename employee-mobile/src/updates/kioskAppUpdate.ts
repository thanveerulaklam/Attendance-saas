import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { API_BASE } from '../config';
import { getKioskToken } from '../api/kiosk';

export type KioskAppRelease = {
  version: string | null;
  version_code: number | null;
  size: number;
};

const APK_NAME = 'PunchPay-Kiosk-update.apk';

export function installedVersionName(): string {
  return Application.nativeApplicationVersion || '1.0.4';
}

export function installedVersionCode(): number {
  const native = Number(Application.nativeBuildVersion);
  if (Number.isFinite(native) && native > 0) return native;
  return 0;
}

export async function fetchKioskAppRelease(): Promise<KioskAppRelease> {
  const token = await getKioskToken();
  const res = await fetch(`${API_BASE}/api/kiosk/app-release`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Could not check for updates (${res.status})`);
  }
  return json.data as KioskAppRelease;
}

export function apkDestination() {
  return `${FileSystem.cacheDirectory}${APK_NAME}`;
}

export async function downloadKioskApk(
  onProgress?: (fraction: number) => void
): Promise<string> {
  const token = await getKioskToken();
  if (!token) throw new Error('Kiosk is not signed in');
  const destination = apkDestination();
  await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
  const download = FileSystem.createDownloadResumable(
    `${API_BASE}/api/kiosk/app-release/apk`,
    destination,
    { headers: { Authorization: `Bearer ${token}` } },
    (progress) => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0 && onProgress) {
        onProgress(progress.totalBytesWritten / total);
      }
    }
  );
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('Download did not finish');
  return result.uri;
}

export async function openApkInstaller(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Updates install on the Android tablet');
  }
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: 'application/vnd.android.package-archive',
    });
  } catch {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: 'package:com.punchpay.kiosk',
    });
    throw new Error('Allow PunchPay Kiosk to install apps, then tap Install again');
  }
}
