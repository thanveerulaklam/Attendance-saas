import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  downloadKioskApk,
  fetchKioskAppRelease,
  installedVersionCode,
  installedVersionName,
  openApkInstaller,
} from './kioskAppUpdate';

export type KioskAppUpdateStatus =
  | 'checking'
  | 'current'
  | 'downloading'
  | 'ready'
  | 'error';

export type KioskAppUpdate = {
  status: KioskAppUpdateStatus;
  localVersion: string;
  remoteVersion: string | null;
  progress: number;
  message: string | null;
  install: () => Promise<void>;
};

export function useKioskAppUpdate(enabled: boolean): KioskAppUpdate {
  const [status, setStatus] = useState<KioskAppUpdateStatus>('checking');
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const fileUriRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const localVersion = installedVersionName();

  const beginDownload = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    setMessage(null);
    try {
      const uri = await downloadKioskApk(setProgress);
      fileUriRef.current = uri;
      setStatus('ready');
      setProgress(1);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not download the update');
    }
  }, []);

  const install = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      let uri = fileUriRef.current;
      if (!uri || status === 'error') {
        setStatus('downloading');
        setProgress(0);
        uri = await downloadKioskApk(setProgress);
        fileUriRef.current = uri;
        setStatus('ready');
      }
      setMessage(null);
      await openApkInstaller(uri);
    } catch (err) {
      setStatus(fileUriRef.current ? 'ready' : 'error');
      setMessage(err instanceof Error ? err.message : 'Could not open the installer');
    }
  }, [status]);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android' || startedRef.current) return undefined;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const release = await fetchKioskAppRelease();
        if (cancelled) return;
        const remoteCode = Number(release.version_code);
        const localCode = installedVersionCode();
        if (!Number.isFinite(remoteCode) || remoteCode <= localCode) {
          setStatus('current');
          return;
        }
        setRemoteVersion(release.version);
        await beginDownload();
      } catch {
        if (!cancelled) setStatus('current');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [beginDownload, enabled]);

  return {
    status,
    localVersion,
    remoteVersion,
    progress,
    message,
    install,
  };
}
