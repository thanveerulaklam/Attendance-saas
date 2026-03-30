import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionStatus } from '../utils/subscription';
import { authFetch } from '../utils/api';
import WhatsAppHelpButton from '../components/WhatsAppHelpButton';

// Keep /dashboard route available, but hide it from the sidebar for now.
const baseNavItems = [
  { to: '/attendance', label: 'Attendance' },
  { to: '/advances', label: 'Advance' },
  { to: '/payroll', label: 'Payroll' },
  { to: '/reports', label: 'Reports' },
  { to: '/employees', label: 'Employee' },
  { to: '/shifts', label: 'Shift' },
  { to: '/devices', label: 'Device' },
  { to: '/settings/company', label: 'Company' },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [company, setCompany] = useState(null);
  const isCompanyAdmin = user?.role === 'admin' && Number(user?.company_id) > 0;
  const isSuperAdmin =
    user?.role === 'admin' &&
    (user?.company_id == null || Number(user?.company_id) === 0);
  const navItems = isCompanyAdmin
    ? [...baseNavItems, { to: '/settings/change-password', label: 'Change Password' }]
    : baseNavItems;
  const adminNavItems = isSuperAdmin ? [{ to: '/enquiries', label: 'Enquiries' }] : [];
  const subscription = getSubscriptionStatus(company);
  const showBanner = company && (
    !subscription.allowed ||
    subscription.inGrace ||
    (subscription.daysLeft != null && subscription.daysLeft <= 30)
  );

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.data) setCompany(json.data);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Renewal banner */}
      {showBanner && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
            !subscription.allowed
              ? 'bg-rose-100 text-rose-800 border-b border-rose-200'
              : subscription.inGrace
                ? 'bg-amber-100 text-amber-800 border-b border-amber-200'
                : 'bg-amber-50 text-amber-800 border-b border-amber-100'
          }`}
        >
          {!subscription.allowed ? (
            <>Subscription has expired. Please renew to continue using payroll and device sync.</>
          ) : subscription.inGrace ? (
            <>Renewal grace period: {subscription.daysLeft} days left. Renew soon to avoid service interruption.</>
          ) : (
            <>Renewal in {subscription.daysLeft} days ({company?.subscription_end_date}).</>
          )}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col py-6 px-4">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D4A843]"
            aria-hidden
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0A0A0A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div className="font-syne text-lg font-extrabold tracking-tight text-slate-100">
              Punch<span className="text-[#D4A843]">Pay</span>
            </div>
            <div className="text-[10px] tracking-wide text-[#A07820]">Punch in. Pay out.</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          {[...navItems, ...adminNavItems].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-500/10 text-primary-100'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 px-2 text-xs text-slate-500">
          © {new Date().getFullYear()} PunchPay
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-16 border-b border-slate-200 bg-white/70 backdrop-blur flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {company?.name || 'PunchPay'}
            </h1>
            <p className="text-xs text-slate-500">Realtime insights into attendance and payroll</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { logout(); navigate('/login'); }}
              className="text-xs rounded-full px-3 py-1.5 border border-slate-200 text-slate-700 hover:border-primary-200 hover:text-primary-700 transition-colors"
            >
              Log out
            </button>
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-primary-500 to-primary-300 text-white flex items-center justify-center text-xs font-semibold shadow-soft" title={user?.email}>
              {(user?.email || 'U').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>

      <WhatsAppHelpButton />
    </div>
  );
}

