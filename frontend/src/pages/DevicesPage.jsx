import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

function maskKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return '';
  if (apiKey.length <= 8) return apiKey;
  const start = apiKey.slice(0, 4);
  const end = apiKey.slice(-4);
  return `${start}••••••••${end}`;
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return 'Never';
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function isRecentlyOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const seenAt = new Date(lastSeenAt);
  if (Number.isNaN(seenAt.getTime())) return false;
  const ONLINE_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
  return Date.now() - seenAt.getTime() <= ONLINE_WINDOW_MS;
}

export default function DevicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showFullKeyId, setShowFullKeyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [branches, setBranches] = useState([]);
  const [newBranchId, setNewBranchId] = useState('');
  const [admsInputs, setAdmsInputs] = useState({});
  const [isupInputs, setIsupInputs] = useState({});
  const [isupInfo, setIsupInfo] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteTypedName, setDeleteTypedName] = useState('');
  const [mobileAttendanceEnabled, setMobileAttendanceEnabled] = useState(false);
  const [mobileSaving, setMobileSaving] = useState(false);
  const [mobileToast, setMobileToast] = useState(null);
  const [kioskBusyBranchId, setKioskBusyBranchId] = useState(null);
  const [kioskByBranch, setKioskByBranch] = useState({});
  const [kioskSettingsPins, setKioskSettingsPins] = useState({});
  const [apkDownloading, setApkDownloading] = useState(false);
  const [kioskError, setKioskError] = useState(null);
  const [kioskSuccess, setKioskSuccess] = useState(null);

  const normalizeKioskPinInput = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);

  const setBranchKioskPin = (branchId, value) => {
    setKioskSettingsPins((prev) => ({
      ...prev,
      [branchId]: normalizeKioskPinInput(value),
    }));
  };

  const rememberKiosk = (branchId, branchName, token, settingsPinConfigured) => {
    setKioskByBranch((prev) => ({
      ...prev,
      [branchId]: {
        branchName,
        token: token || '',
        settingsPinConfigured: Boolean(settingsPinConfigured),
      },
    }));
  };

  const kioskPayload = (branchId, branchName) => {
    const pin = kioskSettingsPins[branchId] || '';
    return {
      label: `${branchName} tablet`,
      ...(pin ? { settings_pin: pin } : {}),
    };
  };

  const branchNameById = useMemo(() => {
    const m = {};
    (branches || []).forEach((b) => {
      m[String(b.id)] = b.name || `Branch #${b.id}`;
    });
    return m;
  }, [branches]);

  useEffect(() => {
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setMobileAttendanceEnabled(Boolean(json?.data?.mobile_attendance_enabled)))
      .catch(() => setMobileAttendanceEnabled(false));
  }, []);

  const handleToggleMobileAttendance = async (nextEnabled) => {
    if (!nextEnabled && mobileAttendanceEnabled) {
      const ok = window.confirm(
        'Turn off mobile attendance? Employees will no longer be able to punch from the mobile app. Biometric devices are not affected.'
      );
      if (!ok) return;
    }
    try {
      setMobileSaving(true);
      setMobileToast(null);
      const res = await authFetch('/api/company/mobile-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_attendance_enabled: nextEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save mobile settings');
      setMobileAttendanceEnabled(Boolean(json.data?.mobile_attendance_enabled));
      setMobileToast({
        type: 'success',
        message: nextEnabled ? 'Mobile attendance enabled.' : 'Mobile attendance disabled.',
      });
    } catch (err) {
      setMobileToast({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setMobileSaving(false);
    }
  };

  const handleDownloadKioskApk = async () => {
    if (apkDownloading) return;
    try {
      setApkDownloading(true);
      setMobileToast(null);
      const res = await authFetch('/api/company/kiosk-apk');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Unable to download APK');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PunchPay-Kiosk.apk';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMobileToast({
        type: 'success',
        message:
          'APK downloaded. On Android: open the file → Allow install from this source → Install.',
      });
    } catch (err) {
      setMobileToast({
        type: 'error',
        message: err.message || 'Failed to download APK',
      });
    } finally {
      setApkDownloading(false);
    }
  };

  const handleGenerateKioskCode = async (branchId, branchName) => {
    if (kioskBusyBranchId) return;
    try {
      setKioskBusyBranchId(branchId);
      setKioskError(null);
      const res = await authFetch(`/api/company/branches/${branchId}/kiosk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kioskPayload(branchId, branchName)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create kiosk code');
      rememberKiosk(
        branchId,
        branchName,
        json.data?.token,
        json.data?.settings_pin_configured
      );
      setKioskSuccess(json.message || 'Kiosk code ready for this branch.');
    } catch (err) {
      setKioskError(err.message || 'Failed to generate kiosk code');
    } finally {
      setKioskBusyBranchId(null);
    }
  };

  const handleSaveKioskPin = async (branchId, branchName) => {
    if (kioskBusyBranchId) return;
    const pin = kioskSettingsPins[branchId] || '';
    if (!/^\d{6}$/.test(pin)) {
      setKioskError(`Settings PIN for ${branchName} must be exactly 6 digits.`);
      return;
    }
    try {
      setKioskBusyBranchId(branchId);
      setKioskError(null);
      const res = await authFetch(`/api/company/branches/${branchId}/kiosk/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings_pin: pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save Settings PIN');
      setKioskByBranch((prev) => ({
        ...prev,
        [branchId]: {
          ...(prev[branchId] || { branchName, token: '' }),
          settingsPinConfigured: true,
        },
      }));
      setKioskSuccess(`Settings PIN saved for ${branchName}.`);
    } catch (err) {
      setKioskError(err.message || 'Failed to save Settings PIN');
    } finally {
      setKioskBusyBranchId(null);
    }
  };

  const handleRegenerateKioskCode = async (branchId, branchName) => {
    if (kioskBusyBranchId) return;
    if (
      !window.confirm(
        `Generate a new kiosk code for ${branchName}? The tablet will need to be activated again with the new code.`
      )
    ) {
      return;
    }
    try {
      setKioskBusyBranchId(branchId);
      setKioskError(null);
      const res = await authFetch(`/api/company/branches/${branchId}/kiosk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...kioskPayload(branchId, branchName), regenerate: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to regenerate kiosk code');
      rememberKiosk(
        branchId,
        branchName,
        json.data?.token,
        json.data?.settings_pin_configured
      );
      setKioskSuccess(json.message || 'New kiosk code generated.');
    } catch (err) {
      setKioskError(err.message || 'Failed to regenerate kiosk code');
    } finally {
      setKioskBusyBranchId(null);
    }
  };

  const handleRevokeKioskCode = async (branchId) => {
    if (!window.confirm('Revoke kiosk access for this branch? The tablet will need a new code.')) return;
    try {
      setKioskBusyBranchId(branchId);
      const res = await authFetch(`/api/company/branches/${branchId}/kiosk`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to revoke kiosk');
      setKioskByBranch((prev) => ({
        ...prev,
        [branchId]: { ...(prev[branchId] || {}), token: '', settingsPinConfigured: false },
      }));
      setKioskSuccess('Kiosk access revoked.');
    } catch (err) {
      setKioskError(err.message || 'Failed to revoke kiosk');
    } finally {
      setKioskBusyBranchId(null);
    }
  };

  const loadBranches = async () => {
    try {
      const res = await authFetch('/api/company/branches', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      setBranches(list);
      setNewBranchId((prev) => prev || (list[0] ? String(list[0].id) : ''));
    } catch {
      setBranches([]);
    }
  };

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/device', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Unable to load devices');
      }
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      setDevices(list);
      setAdmsInputs((prev) => {
        const next = { ...prev };
        list.forEach((d) => {
          if (next[d.id] == null) {
            next[d.id] = d.adms_sn || '';
          }
        });
        return next;
      });
      setIsupInputs((prev) => {
        const next = { ...prev };
        list.forEach((d) => {
          if (next[d.id] == null) {
            next[d.id] = d.isup_device_id || '';
          }
        });
        return next;
      });
    } catch (err) {
      setError(err.message || 'Unable to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin || !mobileAttendanceEnabled || branches.length === 0) return undefined;
    let cancelled = false;
    Promise.all(
      branches.map(async (branch) => {
        const res = await authFetch(`/api/company/branches/${branch.id}/kiosk`);
        const json = await res.json().catch(() => ({}));
        return [
          branch.id,
          {
            branchName: branch.name,
            token: json.data?.token || '',
            settingsPinConfigured: Boolean(json.data?.settings_pin_configured),
          },
        ];
      })
    )
      .then((entries) => {
        if (!cancelled) setKioskByBranch(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, mobileAttendanceEnabled, branches]);

  useEffect(() => {
    loadDevices();
    loadBranches();
    authFetch('/api/device/isup-info', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setIsupInfo(json?.data || null))
      .catch(() => setIsupInfo(null));
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      setCreating(true);
      const resolvedBranch =
        newBranchId ||
        (branches.length === 1 ? String(branches[0].id) : '');
      if (!resolvedBranch) {
        setToast({
          type: 'error',
          message: 'Select a branch for this device',
        });
        return;
      }

      const res = await authFetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          branch_id: Number(resolvedBranch),
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to register device');
      }
      await loadDevices();
      setNewName('');
      setModalOpen(false);
      setToast({ type: 'success', message: 'Device registered successfully' });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to register device',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (device) => {
    const targetPath = device.is_active ? 'deactivate' : 'activate';
    try {
      setBusyId(device.id);
      const res = await authFetch(`/api/device/${device.id}/${targetPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Failed to update device status');
      }
      await loadDevices();
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update device status',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerateKey = async (device) => {
    const confirmed = window.confirm(
      `Regenerate API key for "${device.name}"?\n\nExisting devices using the old key will stop syncing until updated.`
    );
    if (!confirmed) return;
    try {
      setBusyId(device.id);
      const res = await authFetch(`/api/device/${device.id}/regenerate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Failed to regenerate API key');
      }
      const json = await res.json();
      const updated = json.data;
      setDevices((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
      setShowFullKeyId(updated.id);
      setToast({
        type: 'success',
        message: 'API key regenerated. Remember to update your device.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to regenerate API key',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerateCloudToken = async (device) => {
    const confirmed = window.confirm(
      `Regenerate Cloud token for "${device.name}"?\n\nAny device push setup using the old token must be updated.`
    );
    if (!confirmed) return;
    try {
      setBusyId(device.id);
      const res = await authFetch(`/api/device/${device.id}/regenerate-cloud-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Failed to regenerate cloud token');
      }
      const json = await res.json();
      const updated = json.data;
      setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setToast({
        type: 'success',
        message: 'Cloud token regenerated. Update the token on your device.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to regenerate cloud token',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyKey = async (device) => {
    try {
      await navigator.clipboard.writeText(device.api_key);
      setToast({ type: 'success', message: 'API key copied to clipboard' });
      setShowFullKeyId(device.id);
    } catch {
      setToast({
        type: 'error',
        message: 'Unable to copy API key. Please copy it manually.',
      });
    }
  };

  const handleCopyCloudToken = async (device) => {
    if (!device.cloud_token) {
      setToast({ type: 'error', message: 'Cloud token not available for this device yet.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(device.cloud_token);
      setToast({ type: 'success', message: 'Cloud token copied to clipboard' });
    } catch {
      setToast({
        type: 'error',
        message: 'Unable to copy cloud token. Please copy it manually.',
      });
    }
  };

  const handleSaveAdmsSerial = async (device) => {
    try {
      setBusyId(device.id);
      const admsSn = String(admsInputs[device.id] || '').trim();
      const res = await authFetch(`/api/device/${device.id}/adms-serial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adms_sn: admsSn }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Failed to save ADMS serial');
      }
      const json = await res.json();
      const updated = json.data;
      setDevices((prev) =>
        prev.map((d) =>
          d.id === updated.id
            ? {
                ...d,
                ...updated,
                isup_device_id:
                  updated.isup_device_id !== undefined ? updated.isup_device_id : d.isup_device_id,
              }
            : d
        )
      );
      setAdmsInputs((prev) => ({ ...prev, [device.id]: updated.adms_sn || '' }));
      setToast({ type: 'success', message: 'ADMS serial saved.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save ADMS serial' });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveIsupDeviceId = async (device, generate = false) => {
    try {
      setBusyId(device.id);
      const body = generate
        ? { generate: true }
        : { isup_device_id: String(isupInputs[device.id] || '').trim() };
      const res = await authFetch(`/api/device/${device.id}/isup-id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Failed to save Hikvision Device ID');
      }
      const json = await res.json();
      const updated = json.data;
      setDevices((prev) =>
        prev.map((d) =>
          d.id === updated.id
            ? { ...d, ...updated, adms_sn: updated.adms_sn ?? d.adms_sn }
            : d
        )
      );
      setIsupInputs((prev) => ({ ...prev, [device.id]: updated.isup_device_id || '' }));
      setToast({
        type: 'success',
        message: updated.isup_device_id
          ? 'Hikvision Device ID saved.'
          : 'Hikvision ISUP cleared for this device.',
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save Hikvision Device ID' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!device) return;
    if (deleteTypedName.trim() !== device.name) {
      setToast({
        type: 'error',
        message: 'Device name did not match. Delete cancelled.',
      });
      return;
    }

    try {
      setBusyId(device.id);
      const res = await authFetch(`/api/device/${device.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete device');
      }
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      setAdmsInputs((prev) => {
        const next = { ...prev };
        delete next[device.id];
        return next;
      });
      if (showFullKeyId === device.id) {
        setShowFullKeyId(null);
      }
      setDeleteTarget(null);
      setDeleteStep(1);
      setDeleteTypedName('');
      setToast({ type: 'success', message: 'Device deleted successfully' });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to delete device',
      });
    } finally {
      setBusyId(null);
    }
  };

  const openDeleteModal = (device) => {
    setDeleteTarget(device);
    setDeleteStep(1);
    setDeleteTypedName('');
  };

  const closeDeleteModal = () => {
    if (deleteTarget && busyId === deleteTarget.id) return;
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteTypedName('');
  };

  const closeToast = () => setToast(null);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed inset-x-3 top-20 z-30 sm:inset-x-auto sm:right-6">
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-soft ${
              toast.type === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}
          >
            <span className="mt-0.5 text-sm">
              {toast.type === 'error' ? '⚠️' : '✅'}
            </span>
            <div>
              <p className="font-medium">
                {toast.type === 'error' ? 'Something went wrong' : 'Success'}
              </p>
              <p className="mt-0.5">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={closeToast}
              className="ml-2 text-[11px] text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <header>
        <h1 className="text-lg font-semibold text-slate-900">Devices</h1>
        <p className="text-xs text-slate-500">
          Register biometric or punch devices and verify that they are syncing correctly.
        </p>
      </header>

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Face attendance (office tablet)</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Install the PunchPay Kiosk app on a reception tablet. Employees punch by face — no personal phone or login needed.
          </p>
          {mobileToast && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
                mobileToast.type === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {mobileToast.message}
            </div>
          )}
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={mobileAttendanceEnabled}
              onChange={(e) => handleToggleMobileAttendance(e.target.checked)}
              disabled={mobileSaving}
            />
            <span>
              <span className="font-medium">Enable mobile attendance</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                When off, mobile punch APIs return an error. Existing biometric punches are unchanged.
              </span>
            </span>
          </label>
          {mobileAttendanceEnabled && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-semibold text-slate-900">Install office tablet app</p>
              <p className="mt-1 text-[11px] text-slate-600">
                On Android: open the downloaded file, allow install from Files or Chrome, then Install.
              </p>
              <button
                type="button"
                disabled={apkDownloading}
                onClick={handleDownloadKioskApk}
                className="mt-3 inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {apkDownloading ? 'Downloading…' : 'Download Android APK'}
              </button>
            </div>
          )}
          {mobileAttendanceEnabled && branches.length > 0 && (
            <div className="mt-4">
              {branches.map((branch) => {
                const code = kioskByBranch[branch.id]?.token;
                return (
                  <div key={branch.id} className="mt-3 first:mt-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {branches.length > 1 ? `${branch.name} kiosk code` : 'Kiosk code'}
                    </p>
                    <p className="mt-1 font-mono text-3xl font-bold tracking-[0.28em] text-slate-900">
                      {code || '—'}
                    </p>
                    {!code && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Use Show kiosk code below to create this branch code.
                      </p>
                    )}
                  </div>
                );
              })}
              <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-700">
                <li>Download and install the app.</li>
                <li>Enter the kiosk code shown above.</li>
                <li>Create a Settings PIN.</li>
                <li>
                  Open Settings on the tablet and add the face. Add the employee&apos;s main details on the website.
                </li>
                <li>Start attendance.</li>
              </ol>
              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                If this tablet already has the app, install the download again over it.
                Android replaces the old app and keeps the kiosk code. Do not uninstall first.
                After this update, later versions install from Settings on the tablet.
              </p>
              <p className="mt-3 text-[11px] text-slate-500">
                <Link to="/mobile-punch-log" className="font-medium text-indigo-600 underline">
                  View punch log
                </Link>
              </p>
            </div>
          )}
          {kioskError && (
            <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {kioskError}
            </div>
          )}
          {kioskSuccess && (
            <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              {kioskSuccess}
            </div>
          )}
          {mobileAttendanceEnabled && branches.length > 0 && (
            <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
              {branches.map((b) => (
                <li key={b.id} className="space-y-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{b.name}</span>
                    <span className="text-[10px] text-slate-400">ID {b.id}</span>
                    <button
                      type="button"
                      onClick={() => handleGenerateKioskCode(b.id, b.name)}
                      disabled={kioskBusyBranchId === b.id}
                      className="ml-auto text-[11px] font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                    >
                      {kioskBusyBranchId === b.id ? 'Working…' : 'Show kiosk code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateKioskCode(b.id, b.name)}
                      disabled={kioskBusyBranchId === b.id}
                      className="text-[11px] font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      New code
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevokeKioskCode(b.id)}
                      disabled={kioskBusyBranchId === b.id}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      Revoke kiosk
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Settings PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={kioskSettingsPins[b.id] || ''}
                      onChange={(e) => setBranchKioskPin(b.id, e.target.value)}
                      placeholder="6 digits"
                      disabled={kioskBusyBranchId === b.id}
                      className="w-[120px] rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tracking-[0.25em] text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveKioskPin(b.id, b.name)}
                      disabled={kioskBusyBranchId === b.id}
                      className="rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {kioskBusyBranchId === b.id ? 'Saving…' : 'Save PIN'}
                    </button>
                    <span className="text-[10px] text-slate-500">
                      PIN for this branch tablet only
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {mobileAttendanceEnabled && branches.length === 0 && (
            <p className="mt-3 text-[11px] text-slate-600">
              Add a branch in{' '}
              <Link to="/settings/company" className="font-medium text-indigo-600 underline">
                Company settings
              </Link>{' '}
              before creating a kiosk code.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Each device gets its own secure API key. The last sync time tells you if data is flowing.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + Register device
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="h-32 rounded-xl border border-slate-100 bg-slate-50/80 animate-pulse"
              />
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <p className="text-sm text-slate-600">
              No devices yet. Register your first biometric or punch device to start receiving attendance logs.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Add your first device
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => {
              const online = isRecentlyOnline(device.last_seen_at);
              const hasSyncIssues =
                Array.isArray(device.sync_issues) && device.sync_issues.length > 0;
              const showingFull = showFullKeyId === device.id;
              const displayKey = showingFull
                ? device.api_key
                : maskKey(device.api_key);
              return (
                <article
                  key={device.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        {device.name}
                      </h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        ID #{device.id}
                        {device.branch_id != null && (
                          <>
                            {' '}
                            ·{' '}
                            <span className="text-slate-600">
                              {branchNameById[String(device.branch_id)] ||
                                `Branch #${device.branch_id}`}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          device.is_active
                            ? online
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />
                        {device.is_active
                          ? online
                            ? 'Online'
                            : 'No recent sync'
                          : 'Inactive'}
                      </span>
                      {hasSyncIssues && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          Punch issue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                    <div>
                      <p className="font-medium text-slate-700">API key</p>
                      <div className="mt-0.5 flex items-center justify-between gap-2 rounded-md bg-slate-900 px-2 py-1 text-[10px] text-slate-50">
                        <span className="truncate font-mono">{displayKey}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setShowFullKeyId(
                                showingFull ? null : device.id
                              )
                            }
                            className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[9px]"
                          >
                            {showingFull ? 'Hide' : 'Reveal'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyKey(device)}
                            className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[9px]"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-slate-700">Cloud token</p>
                      <div className="mt-0.5 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700">
                        <span className="truncate font-mono">
                          {device.cloud_token || 'Not issued yet'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCloudToken(device)}
                          className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-700"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Use this short token for device cloud/webhook setup.
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-slate-700">ADMS serial (SN)</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <input
                          value={admsInputs[device.id] ?? device.adms_sn ?? ''}
                          onChange={(e) =>
                            setAdmsInputs((prev) => ({
                              ...prev,
                              [device.id]: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="e.g. AAE123456"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-800"
                        />
                        <button
                          type="button"
                          disabled={busyId === device.id}
                          onClick={() => handleSaveAdmsSerial(device)}
                          className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[9px] text-slate-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        For ADMS devices, set this to the device SN shown in system info.
                      </p>
                    </div>

                    <details className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <summary className="cursor-pointer text-[10px] font-medium text-slate-700">
                        Hikvision ISUP
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-slate-500">
                          Use this only for a Hikvision terminal that dials out. Leave Hik-Connect off.
                          On the device open Communication, then ISUP, and enter the values below.
                          The person&apos;s User ID must match their employee code.
                        </p>
                        <p className="font-mono text-[10px] text-slate-700">
                          Server {isupInfo?.serverHost || 'punchpay.in'} · port {isupInfo?.cmsPort || 7660}
                          {' '}· alarm {isupInfo?.alarmPort || 7663}
                        </p>
                        <p className="font-mono text-[10px] text-slate-700">
                          Key {isupInfo?.encryptionKey || 'Set ISUP_ENCRYPTION_KEY on the server'}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            value={isupInputs[device.id] ?? device.isup_device_id ?? ''}
                            onChange={(e) =>
                              setIsupInputs((prev) => ({
                                ...prev,
                                [device.id]: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="Device ID"
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-800"
                          />
                          <button
                            type="button"
                            disabled={busyId === device.id}
                            onClick={() => handleSaveIsupDeviceId(device, false)}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[9px] text-slate-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busyId === device.id}
                            onClick={() => handleSaveIsupDeviceId(device, true)}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[9px] text-slate-700 disabled:opacity-50"
                          >
                            Generate
                          </button>
                        </div>
                      </div>
                    </details>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Last sync</span>
                      <span className="font-medium text-slate-800">
                        {formatLastSeen(device.last_seen_at)}
                      </span>
                    </div>

                    {device.adms_force_full_sync && (
                      <div className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-2">
                        <p className="text-[10px] font-medium text-blue-800">
                          Catching up on missed punches…
                        </p>
                        <p className="mt-0.5 text-[9px] text-blue-700">
                          This device is re-uploading attendance. This clears automatically when done.
                        </p>
                      </div>
                    )}

                    {Array.isArray(device.sync_issues) && device.sync_issues.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
                        <p className="text-[10px] font-semibold text-amber-900">
                          Punches need your attention
                        </p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4">
                          {device.sync_issues.map((issue) => (
                            <li
                              key={`${issue.reason}-${issue.employee_code}`}
                              className="text-[10px] text-amber-900"
                            >
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[9px] text-amber-800">
                          Other employees on this device are still syncing normally. Fix the codes
                          above in{' '}
                          <Link to="/employees" className="font-medium underline hover:text-amber-950">
                            Employees
                          </Link>{' '}
                          to clear this warning.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-2">
                    <button
                      type="button"
                      disabled={busyId === device.id}
                      onClick={() => handleToggleActive(device)}
                      className="text-[11px] font-medium text-slate-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      {device.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === device.id}
                      onClick={() => handleRegenerateKey(device)}
                      className="text-[11px] font-medium text-primary-700 hover:text-primary-800 disabled:opacity-50"
                    >
                      Regenerate key
                    </button>
                    <button
                      type="button"
                      disabled={busyId === device.id}
                      onClick={() => handleRegenerateCloudToken(device)}
                      className="text-[11px] font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
                    >
                      Regenerate token
                    </button>
                    <button
                      type="button"
                      disabled={busyId === device.id}
                      onClick={() => openDeleteModal(device)}
                      className="text-[11px] font-medium text-rose-700 hover:text-rose-800 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-[11px] text-slate-400">
          Once wired, adding a device will complete the &quot;Register device&quot; step, and the
          first successful sync will complete &quot;Verify device sync&quot;.
        </p>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-soft">
            <h2 className="text-sm font-semibold text-slate-900">
              Register new device
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Give your biometric or punch device a friendly name so you can identify it later.
            </p>
            <form onSubmit={handleCreate} className="mt-3 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">
                  Device name
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="e.g. Main gate biometric"
                />
              </div>
              {branches.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Branch
                  </label>
                  <select
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  >
                    {branches.length > 1 && (
                      <option value="">Select branch</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Punches from this device are tagged to this branch. Use one device per location.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    creating ||
                    !newName.trim() ||
                    branches.length === 0 ||
                    (branches.length > 1 && !newBranchId)
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Saving…' : 'Save device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-soft">
            <h2 className="text-sm font-semibold text-slate-900">Delete device</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Step {deleteStep} of 3
            </p>

            {deleteStep === 1 && (
              <div className="mt-3 space-y-3">
                <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  Delete <span className="font-semibold">&quot;{deleteTarget.name}&quot;</span>?
                  This stops all future sync from this device.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div className="mt-3 space-y-3">
                <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Are you absolutely sure? You will need to register this device again if you want
                  to reconnect it later.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep(1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(3)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    I understand
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 3 && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] text-slate-600">
                  Final check: type{' '}
                  <span className="rounded bg-slate-100 px-1 font-mono text-slate-900">
                    {deleteTarget.name}
                  </span>{' '}
                  to confirm deletion.
                </p>
                <input
                  value={deleteTypedName}
                  onChange={(e) => setDeleteTypedName(e.target.value)}
                  disabled={busyId === deleteTarget.id}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-300"
                  placeholder="Type exact device name"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    disabled={busyId === deleteTarget.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={
                      busyId === deleteTarget.id ||
                      deleteTypedName.trim() !== deleteTarget.name
                    }
                    onClick={() => handleDeleteDevice(deleteTarget)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busyId === deleteTarget.id ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

