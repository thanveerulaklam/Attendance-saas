import { useEffect } from 'react';
import { Link } from 'react-router-dom';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function useSeo(title, description) {
  useEffect(() => {
    document.title = title;
    const existing = document.querySelector('meta[name="description"]');
    if (existing) {
      existing.setAttribute('content', description);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      meta.setAttribute('content', description);
      document.head.appendChild(meta);
    }
  }, [title, description]);
}

export default function ToolPageLayout({
  children,
  toolName,
  showBottomCta = true,
  bottomCtaText = 'Try PunchPay Free ->',
}) {
  const handleConversion = (name) => {
    // Placeholder tracking until analytics integration.
    console.log('Tool conversion:', name);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xl font-extrabold text-blue-700">
              PunchPay
            </Link>
            <span className="text-sm text-slate-500">/ Free HR Tools</span>
          </div>
          <Link
            to="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Login
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>

      {showBottomCta && (
        <section className="mx-auto mt-4 w-full max-w-6xl px-4 pb-6">
          <div className="rounded-2xl bg-blue-600 p-5 text-white shadow-sm md:flex md:items-center md:justify-between">
            <p className="max-w-3xl text-base font-medium leading-relaxed">
              Tired of calculating this manually every month? PunchPay automates attendance + payroll for your entire team.
            </p>
            <Link
              to="/register"
              onClick={() => handleConversion(toolName)}
              className="mt-4 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-bold text-blue-700 md:mt-0"
            >
              {bottomCtaText}
            </Link>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-slate-500">
          © 2025 PunchPay | punchpay.in | Free HR Tools for Indian Businesses
        </div>
      </footer>
    </div>
  );
}

export { formatCurrency };
