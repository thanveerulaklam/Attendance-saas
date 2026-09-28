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
import {
  getToken,
  setToken,
  setUnauthorizedHandler,
} from '../api/client';
import type { ApiError, FieldUser, MeResponse } from '../api/types';

type AuthContextValue = {
  token: string | null;
  user: FieldUser | null;
  profile: MeResponse | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<MeResponse | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function assertFieldEmployee(user: FieldUser | undefined) {
  if (!user) {
    throw Object.assign(new Error('Unable to sign in.'), { code: 'NO_USER' });
  }
  if (user.role !== 'employee') {
    throw Object.assign(
      new Error('This app is for field employees. Admins and HR should use PunchPay Admin.'),
      { code: 'NOT_EMPLOYEE' }
    );
  }
  if (!user.employee_id) {
    throw Object.assign(new Error('Your account is not linked to an employee profile.'), {
      code: 'NO_EMPLOYEE_ID',
    });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<FieldUser | null>(null);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOut = useRef(false);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await setToken(null);
      setTokenState(null);
      setUser(null);
      setProfile(null);
    } finally {
      signingOut.current = false;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const data = await fetchMe();
    setProfile(data);
    return data;
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
        const me = await fetchMe();
        if (cancelled) return;
        setTokenState(stored);
        setProfile(me);
        setUser({
          role: 'employee',
          employee_id: me.employee.id,
          name: me.employee.name,
          company_id: me.company.id,
        });
      } catch (err) {
        const status = (err as ApiError).status;
        if (status === 401 || status === 403) {
          await signOut();
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
    assertFieldEmployee(nextUser);
    const t = res.data.token;
    await setToken(t);
    setTokenState(t);
    setUser(nextUser);
    const me = await fetchMe();
    setProfile(me);
  }, []);

  const value = useMemo(
    () => ({ token, user, profile, loading, signIn, signOut, refreshProfile }),
    [token, user, profile, loading, signIn, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
