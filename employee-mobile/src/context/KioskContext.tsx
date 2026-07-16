import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  activateKiosk,
  fetchKioskStatus,
  getCachedKioskSession,
  getKioskToken,
  normalizeKioskCode,
  setActiveKioskSettingsPin,
  setCachedKioskSession,
  setKioskToken,
} from '../api/kiosk';
import type { KioskSession } from '../api/kiosk';

type KioskContextValue = {
  token: string | null;
  session: KioskSession | null;
  loading: boolean;
  activate: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const KioskContext = createContext<KioskContextValue | null>(null);

function isUnauthorizedError(err: unknown) {
  const e = err as Error & { status?: number; code?: string };
  return e.status === 401 || e.code === 'KIOSK_UNAUTHORIZED';
}

export function KioskProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [session, setSession] = useState<KioskSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (activeToken?: string | null) => {
    const t = activeToken ?? (await getKioskToken());
    if (!t) {
      setSession(null);
      return;
    }
    const data = await fetchKioskStatus();
    setSession(data);
    await setCachedKioskSession(data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const storedToken = await getKioskToken();
        if (cancelled) return;

        if (!storedToken) {
          setTokenState(null);
          setSession(null);
          return;
        }

        setTokenState(storedToken);
        const cachedSession = await getCachedKioskSession();
        if (cachedSession) {
          setSession(cachedSession);
        }

        try {
          await refresh(storedToken);
        } catch (err) {
          if (isUnauthorizedError(err)) {
            await setKioskToken(null);
            if (!cancelled) {
              setTokenState(null);
              setSession(null);
            }
            return;
          }
          // Keep the saved token/session when offline or server is temporarily unavailable.
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const activate = useCallback(async (rawToken: string) => {
    const normalized = normalizeKioskCode(rawToken);
    const res = await activateKiosk(normalized);
    await setKioskToken(normalized);
    setTokenState(normalized);
    setSession(res.data);
    await setCachedKioskSession(res.data);
  }, []);

  const signOut = useCallback(async () => {
    await setKioskToken(null);
    setActiveKioskSettingsPin(null);
    setTokenState(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ token, session, loading, activate, refresh, signOut }),
    [token, session, loading, activate, refresh, signOut]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error('useKiosk must be used within KioskProvider');
  return ctx;
}
