/**
 * API helper: fetch with JWT from localStorage.
 * Use after login/register; token is stored by AuthContext.
 */
const TOKEN_KEY = 'attendance_saas_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * fetch with Authorization: Bearer <token>.
 * Use for all authenticated API calls.
 */
export function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...options, credentials: 'include', headers });
}
