import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { authFetch } from '../utils/api';

const POLL_MS = 45_000;

function secondsUntil(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

export default function MobileQrDisplayPage() {
  const { branchId } = useParams();
  const [branchName, setBranchName] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const qrPayloadText = useMemo(() => {
    if (!expiresAt) return '';
    return qrDataUrl ? 'loaded' : '';
  }, [expiresAt, qrDataUrl]);

  const fetchToken = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch(`/api/company/branches/${branchId}/qr-token`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Unable to load QR code');
      }
      const data = json.data || {};
      // Encode nonce only — denser QR, more reliable scan. Server looks up branch/company from the nonce.
      // Also accept structured qr_payload from older clients if nonce is missing.
      const text =
        (data.nonce && String(data.nonce)) ||
        (data.qr_payload?.nonce && String(data.qr_payload.nonce)) ||
        JSON.stringify(
          data.qr_payload || {
            v: 1,
            company_id: data.company_id,
            branch_id: Number(branchId),
            nonce: data.nonce,
            exp: data.expires_at
              ? Math.floor(new Date(data.expires_at).getTime() / 1000)
              : undefined,
          }
        );
      if (!text) {
        throw new Error('QR token response missing nonce');
      }
      const url = await QRCode.toDataURL(text, {
        width: 360,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrDataUrl(url);
      setExpiresAt(data.expires_at);
      setCountdown(secondsUntil(data.expires_at));
    } catch (err) {
      setError(err.message || 'Failed to refresh QR');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    authFetch('/api/company/branches')
      .then((res) => res.json())
      .then((json) => {
        const list = Array.isArray(json.data) ? json.data : [];
        const match = list.find((b) => String(b.id) === String(branchId));
        setBranchName(match?.name || `Branch #${branchId}`);
      })
      .catch(() => setBranchName(`Branch #${branchId}`));
  }, [branchId]);

  useEffect(() => {
    fetchToken();
    const poll = setInterval(fetchToken, POLL_MS);
    return () => clearInterval(poll);
  }, [fetchToken]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = setInterval(() => {
      setCountdown(secondsUntil(expiresAt));
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Mobile attendance</p>
          <h1 className="text-lg font-semibold">{branchName}</h1>
        </div>
        <Link
          to="/settings/company"
          className="text-xs text-slate-400 hover:text-white underline"
        >
          Settings
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
        {error && (
          <div className="mb-4 max-w-md rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
            {error}
            <button
              type="button"
              onClick={() => fetchToken()}
              className="ml-2 underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-2xl">
          {loading && !qrDataUrl ? (
            <div className="h-[360px] w-[360px] animate-pulse rounded-lg bg-slate-100" />
          ) : (
            qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="Attendance QR code"
                width={360}
                height={360}
                className="rounded-lg"
              />
            )
          )}
        </div>

        <p className="mt-6 text-sm text-slate-300">
          Employees scan this code in the PunchPay mobile app to mark attendance.
        </p>
        <p className="mt-2 text-2xl font-mono tabular-nums text-emerald-400">
          {countdown > 0 ? `${countdown}s` : 'Refreshing…'}
        </p>
        <p className="mt-1 text-xs text-slate-500">Code refreshes automatically every ~45 seconds</p>

        {!qrPayloadText && !loading && (
          <p className="mt-4 text-xs text-amber-400">
            Enable mobile attendance in Company settings if this page shows an error.
          </p>
        )}
      </main>
    </div>
  );
}
