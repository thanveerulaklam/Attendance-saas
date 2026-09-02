import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, login as apiLogin } from '../api/auth';
import { fetchCompany } from '../api/company';
import {
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  setUnauthorizedHandler,
} from '../api/client';
import type { AdminUser, ApiError, Company } from '../api/types';

type AuthContextValue = {
  token: string | null;
  user: AdminUser | null;
  company: Company | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshCompany: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function assertAdminHr(user: AdminUser | undefined) {
  if (!user) {
    throw Object.assign(new Error('Unable to sign in.'), { code: 'NO_USER' });
  }
  if (user.role !== 'admin' && user.role !== 'hr') {
    throw Object.assign(
      new Error('This app is for admins and HR. Employees should use the office kiosk or web portal.'),
      { code: 'NOT_ADMIN' }
    );
  }
  if (user.company_id == null || Number(user.company_id) === 0) {
    throw Object.assign(
      new Error('Platform admin accounts are not supported here. Use the web portal.'),
      { code: 'PLATFORM_ADMIN' }
    );
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOut = useRef(false);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await setToken(null);
      await setStoredUser(null);
      setTokenState(null);
      setUser(null);
      setCompany(null);
    } finally {
      signingOut.current = false;
    }
  }, []);

  const refreshCompany = useCallback(async () => {
    const data = await fetchCompany();
    setCompany(data);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getToken();
        if (!stored) return;
        const storedUser = await getStoredUser();
        const me = await fetchMe();
        assertAdminHr(me);
        const merged: AdminUser = {
          ...storedUser,
          ...me,
          name: storedUser?.name || me.name,
        };
        if (cancelled) return;
        setTokenState(stored);
        setUser(merged);
        await setStoredUser(merged);
        const companyData = await fetchCompany();
        if (!cancelled) setCompany(companyData);
      } catch (err) {
        const status = (err as ApiError).status;
        if (status === 401 || status === 403) {
          await signOut();
        } else {
          const stored = await getToken();
          const storedUser = await getStoredUser();
          if (!cancelled && stored && storedUser) {
            setTokenState(stored);
            setUser(storedUser);
          } else if (!cancelled) {
            await signOut();
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    const nextUser = res.data?.user;
    assertAdminHr(nextUser);
    const t = res.data.token;
    await setToken(t);
    await setStoredUser(nextUser);
    setTokenState(t);
    setUser(nextUser);
    try {
      const companyData = await fetchCompany();
      setCompany(companyData);
    } catch {
      setCompany(null);
    }
  }, []);

  const value = useMemo(
    () => ({ token, user, company, loading, signIn, signOut, refreshCompany }),
    [token, user, company, loading, signIn, signOut, refreshCompany]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
