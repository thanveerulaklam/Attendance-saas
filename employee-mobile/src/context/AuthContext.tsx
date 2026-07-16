import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getToken, setToken } from '../api/client';
import { login as apiLogin } from '../api/attendance';

type AuthContextValue = {
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken()
      .then(setTokenState)
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email.trim(), password);
    const user = res.data?.user;
    if (user?.role !== 'employee') {
      throw Object.assign(new Error('This app is for employees only. Use the web portal for admin login.'), {
        code: 'NOT_EMPLOYEE',
      });
    }
    if (!user?.employee_id) {
      throw Object.assign(new Error('Your account is not linked to an employee profile.'), {
        code: 'NO_EMPLOYEE_ID',
      });
    }
    const t = res.data.token;
    await setToken(t);
    setTokenState(t);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ token, loading, signIn, signOut }),
    [token, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
