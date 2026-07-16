import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const KIOSK_TOKEN_KEY = 'punchpay_kiosk_token';
const KIOSK_SESSION_KEY = 'punchpay_kiosk_session';
let kioskSettingsPin: string | null = null;

export function normalizeKioskCode(raw: string): string {
  let value = String(raw || '').trim().toUpperCase();
  if (value.startsWith('PK_')) {
    value = value.slice(3);
  }
  return value.replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function setActiveKioskSettingsPin(pin: string | null) {
  kioskSettingsPin = pin;
}

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Some Android builds fail SecureStore; AsyncStorage remains the fallback.
  }
}

async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export async function getKioskToken(): Promise<string | null> {
  const secure = await readSecure(KIOSK_TOKEN_KEY);
  if (secure) return secure;
  return AsyncStorage.getItem(KIOSK_TOKEN_KEY);
}

export async function setKioskToken(token: string | null): Promise<void> {
  if (token) {
    const normalized = normalizeKioskCode(token);
    await writeSecure(KIOSK_TOKEN_KEY, normalized);
    await AsyncStorage.setItem(KIOSK_TOKEN_KEY, normalized);
    return;
  }
  await deleteSecure(KIOSK_TOKEN_KEY);
  await AsyncStorage.removeItem(KIOSK_TOKEN_KEY);
  await AsyncStorage.removeItem(KIOSK_SESSION_KEY);
}

export async function getCachedKioskSession(): Promise<KioskSession | null> {
  const raw = (await readSecure(KIOSK_SESSION_KEY)) || (await AsyncStorage.getItem(KIOSK_SESSION_KEY));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KioskSession;
  } catch {
    return null;
  }
}

export async function setCachedKioskSession(session: KioskSession | null): Promise<void> {
  if (!session) {
    await deleteSecure(KIOSK_SESSION_KEY);
    await AsyncStorage.removeItem(KIOSK_SESSION_KEY);
    return;
  }
  const raw = JSON.stringify(session);
  await writeSecure(KIOSK_SESSION_KEY, raw);
  await AsyncStorage.setItem(KIOSK_SESSION_KEY, raw);
}

type ApiJson = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: unknown;
};

export type KioskPreferences = {
  duplicate_punch_seconds: number;
  min_duplicate_punch_seconds: number;
  max_duplicate_punch_seconds: number;
  default_duplicate_punch_seconds: number;
  min_recognize_seconds: number;
  min_min_recognize_seconds: number;
  max_min_recognize_seconds: number;
  default_min_recognize_seconds: number;
};

export type KioskSession = {
  company: { id: number; name: string };
  branch: { id: number; name: string };
  label?: string;
  enrolled_count?: number;
  face_models_ready?: boolean;
  preferences?: KioskPreferences;
};

export type KioskEmployee = {
  id: number;
  name: string;
  employee_code: string;
  status: string;
  face_enrollment_id?: number | null;
  enrolled_at?: string | null;
  photo_mime?: string | null;
  photo_base64?: string | null;
};

export type KioskAttendanceLog = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  punch_time: string;
  punch_type: string;
};

export async function kioskFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const kioskToken = token ?? (await getKioskToken());
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (kioskToken) {
    headers.Authorization = `Bearer ${kioskToken}`;
  }
  if (kioskSettingsPin) {
    headers['X-Kiosk-Settings-Pin'] = kioskSettingsPin;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let json: ApiJson = {};
  try {
    json = (await res.json()) as ApiJson;
  } catch {
    // non-json
  }

  if (!res.ok) {
    const err = new Error(json.message || `Request failed (${res.status})`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = json.code;
    err.status = res.status;
    throw err;
  }

  return json as T;
}

export async function activateKiosk(token: string) {
  const normalized = normalizeKioskCode(token);
  return kioskFetch<{ success: boolean; data: KioskSession }>(
    '/api/kiosk/activate',
    {
      method: 'POST',
      body: JSON.stringify({ token: normalized }),
    },
    null
  );
}

export async function fetchKioskStatus() {
  const res = await kioskFetch<{ success: boolean; data: KioskSession }>('/api/kiosk/status');
  return res.data;
}

export async function verifyKioskSettingsPin(pin: string) {
  const normalized = pin.trim();
  const previous = kioskSettingsPin;
  kioskSettingsPin = normalized;
  try {
    await kioskFetch<{ success: boolean }>('/api/kiosk/settings/verify', {
      method: 'POST',
    });
    return true;
  } catch (err) {
    kioskSettingsPin = previous;
    throw err;
  }
}

export async function submitKioskPunch(imageBase64: string) {
  const res = await kioskFetch<{
    success: boolean;
    data: {
      punch: { punch_type: string; punch_time: string };
      employee: { id: number; name: string; employee_code?: string };
      match_distance?: number;
    };
  }>('/api/kiosk/punch', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  return res.data;
}

export async function fetchKioskEmployees() {
  const res = await kioskFetch<{
    success: boolean;
    data: { items: KioskEmployee[] };
  }>('/api/kiosk/employees');
  return res.data.items;
}

export async function enrollKioskEmployeeFace(employeeId: number, imageBase64: string) {
  const res = await kioskFetch<{
    success: boolean;
    data: { id: number; enrolled_at: string };
    message?: string;
  }>(`/api/kiosk/employees/${employeeId}/face`, {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  return res;
}

export async function removeKioskEmployeeFace(employeeId: number) {
  return kioskFetch<{ success: boolean; message?: string }>(
    `/api/kiosk/employees/${employeeId}/face`,
    { method: 'DELETE' }
  );
}

export async function fetchKioskAttendanceLogs(params: {
  dateFrom: string;
  dateTo: string;
  employeeId?: number | null;
}) {
  const query = new URLSearchParams({
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });
  if (params.employeeId) query.set('employee_id', String(params.employeeId));
  const res = await kioskFetch<{
    success: boolean;
    data: {
      items: KioskAttendanceLog[];
      date_from: string;
      date_to: string;
    };
  }>(`/api/kiosk/attendance-logs?${query.toString()}`);
  return res.data;
}

export async function fetchKioskPreferences() {
  const res = await kioskFetch<{ success: boolean; data: KioskPreferences }>(
    '/api/kiosk/preferences'
  );
  return res.data;
}

export async function updateKioskPreferences(payload: {
  duplicatePunchSeconds?: number;
  minRecognizeSeconds?: number;
}) {
  const body: Record<string, number> = {};
  if (payload.duplicatePunchSeconds != null) {
    body.duplicate_punch_seconds = payload.duplicatePunchSeconds;
  }
  if (payload.minRecognizeSeconds != null) {
    body.min_recognize_seconds = payload.minRecognizeSeconds;
  }
  const res = await kioskFetch<{
    success: boolean;
    data: KioskPreferences;
    message?: string;
  }>('/api/kiosk/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function recognizeKioskFace(imageBase64: string) {
  const res = await kioskFetch<{
    success: boolean;
    data: {
      employee: { id: number; name: string; employee_code?: string };
      match_distance?: number;
      min_recognize_seconds?: number;
    };
  }>('/api/kiosk/recognize', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  return res.data;
}
