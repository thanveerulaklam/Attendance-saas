import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken as persistToken, clearToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const setToken = useCallback((newToken, userData = null) => {
    if (newToken) {
      persistToken(newToken);
      setTokenState(newToken);
      if (userData) setUser(userData);
    } else {
      clearToken();
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
  }, [setToken]);

  // Validate token and load user on mount
  useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setUser(json.data);
        else setToken(null);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [setToken]);

  const value = {
    token,
    user,
    loading,
    setToken,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
