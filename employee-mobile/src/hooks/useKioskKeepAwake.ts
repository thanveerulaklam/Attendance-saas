import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const KEEP_AWAKE_TAG = 'punchpay-kiosk';

/**
 * Keeps the tablet screen on while PunchPay Kiosk is open so employees
 * can punch without the device sleeping or dimming.
 */
export function useKioskKeepAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      return undefined;
    }

    let cancelled = false;

    const enable = async () => {
      try {
        await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      } catch {
        // Older builds / Expo Go may ignore this; attendance still works.
      }
    };

    enable();

    const subscription = AppState.addEventListener('change', (state) => {
      if (cancelled) return;
      if (state === 'active') {
        enable();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [enabled]);
}

export function isAndroidKioskDevice() {
  return Platform.OS === 'android';
}
