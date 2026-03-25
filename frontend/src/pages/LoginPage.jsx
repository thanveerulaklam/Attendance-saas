import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/apiBase';

const WHATSAPP_NUMBER = '919600844041';
const WHATSAPP_LINK =
  'https://wa.me/919600844041?text=Hi%2C%20I%20want%20to%20try%20PunchPay%20for%20my%20business';

const useInView = (ref) => {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return inView;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { setToken: setAuthToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoName, setDemoName] = useState('');
  const [demoBusiness, setDemoBusiness] = useState('');
  const [demoPhone, setDemoPhone] = useState('');
  const [demoEmployees, setDemoEmployees] = useState('');
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState('');

  const heroRef = useRef(null);
  const statsRef = useRef(null);
  const featuresRef = useRef(null);
  const howItWorksRef = useRef(null);
  const pricingRef = useRef(null);
  const testimonialsRef = useRef(null);
  const loginRef = useRef(null);
  const demoRef = useRef(null);

  const heroInView = useInView(heroRef);
  const statsInView = useInView(statsRef);
  const featuresInView = useInView(featuresRef);
  const howItWorksInView = useInView(howItWorksRef);
  const pricingInView = useInView(pricingRef);
  const testimonialsInView = useInView(testimonialsRef);
  const loginInView = useInView(loginRef);
  const demoInView = useInView(demoRef);

  useEffect(() => {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Login failed');
        return;
      }
      const token = json.data?.token;
      const userData = json.data?.user;
      if (token) {
        setAuthToken(
          token,
          userData
            ? {
                user_id: userData.id,
                company_id: userData.company_id,
                email: userData.email,
                role: userData.role,
              }
            : null
        );
        navigate('/attendance', { replace: true });
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleScrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setDemoError('');
    setDemoSubmitting(true);
    try {
      const payload = {
        full_name: demoName.trim(),
        business_name: demoBusiness.trim(),
        phone_number: demoPhone.trim(),
        employees_range: demoEmployees,
      };

      const res = await fetch(`${API_BASE}/api/demo-enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to request demo');
      }

      setDemoSubmitted(true);
    } catch (err) {
      setDemoError(err.message || 'Failed to request demo');
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="bg-white text-slate-900">
      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white shadow-sm">
        <div className="h-16 flex items-center justify-between px-6 max-w-7xl mx-auto">
          <div>
            <div className="text-2xl font-bold" style={{ color: '#1a56db' }}>
              PunchPay
            </div>
            <div className="text-xs text-slate-400">Punch in. Pay out.</div>
          </div>
          <nav className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-sm">
              <button
                type="button"
                onClick={() => handleScrollToSection('features')}
                className="text-slate-600 hover:text-blue-600"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => handleScrollToSection('how-it-works')}
                className="text-slate-600 hover:text-blue-600"
              >
                How it Works
              </button>
              <button
                type="button"
                onClick={() => handleScrollToSection('pricing')}
                className="text-slate-600 hover:text-blue-600"
              >
                Pricing
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleScrollToSection('login-section')}
              className="rounded-lg border border-blue-600 text-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-50"
            >
              Login
            </button>
          </nav>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero */}
        <section
          ref={heroRef}
          id="hero"
          className="min-h-screen flex items-center bg-[#f0f9ff] px-6"
        >
          <div
            className={`w-full max-w-7xl mx-auto grid gap-12 lg:grid-cols-2 items-center transition-all duration-700 ${
              heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div>
              <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-100 mb-4">
                <span className="mr-1">🇮🇳</span> Made for Indian Businesses
              </div>
              <h1 className="font-bold leading-tight text-3xl sm:text-4xl lg:text-5xl">
                <span style={{ color: '#1a56db' }}>Punch in.</span>{' '}
                <span style={{ color: '#1e293b' }}>Pay out.</span>
              </h1>
              <p className="mt-4 text-xl text-slate-600 max-w-xl">
                Attendance tracking + payroll for factories and shops. Connect your biometric
                machine. Generate salary in one click.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => handleScrollToSection('login-section')}
                  className="bg-[#1a56db] text-white px-6 py-3 rounded-xl font-semibold shadow-sm hover:bg-blue-700"
                >
                  Get Started →
                </button>
                <button
                  type="button"
                  onClick={() => handleScrollToSection('how-it-works')}
                  className="border border-[#1a56db] text-[#1a56db] px-6 py-3 rounded-xl font-semibold bg-white hover:bg-slate-50"
                >
                  See How It Works
                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
                <div className="flex items-center gap-1">
                  <span>✓</span> No credit card needed
                </div>
                <div className="flex items-center gap-1">
                  <span>✓</span> Setup in 30 minutes
                </div>
                <div className="flex items-center gap-1">
                  <span>✓</span> Local support
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 max-w-md ml-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">PunchPay Attendance</div>
                    <div className="text-xs text-slate-500">Live attendance overview</div>
                  </div>
                  <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
                    A
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-6 text-xs">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <div className="text-[10px] text-emerald-600 uppercase tracking-wide">
                      Present Today
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-700">42 / 50</div>
                  </div>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2">
                    <div className="text-[10px] text-rose-600 uppercase tracking-wide">Absent</div>
                    <div className="mt-1 text-sm font-semibold text-rose-700">8</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <div className="text-[10px] text-amber-600 uppercase tracking-wide">
                      On Leave
                    </div>
                    <div className="mt-1 text-sm font-semibold text-amber-700">2</div>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-slate-700">This Week Attendance</div>
                    <div className="text-[11px] text-slate-400">Mon – Sun</div>
                  </div>
                  <div className="h-32 flex items-end gap-2">
                    {[70, 85, 90, 95, 80, 75, 88].map((value, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-full bg-blue-100 overflow-hidden h-24 flex items-end">
                          <div
                            className="w-full bg-blue-500 rounded-full transition-all"
                            style={{ height: `${value}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-700">
                    Payroll Ready ✓
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Next payout:{' '}
                    <span className="font-medium text-slate-600">30th of this month</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section
          ref={statsRef}
          className={`bg-white border-y border-slate-100 py-10 px-6 transition-all duration-700 ${
            statsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="space-y-1">
              <div className="text-3xl font-bold">50+</div>
              <div className="text-xs text-slate-500">Businesses Using PunchPay</div>
            </div>
            <div className="space-y-1 border-l md:border-l md:border-slate-100 md:pl-6">
              <div className="text-3xl font-bold">10,000+</div>
              <div className="text-xs text-slate-500">Employees Tracked</div>
            </div>
            <div className="space-y-1 md:border-l md:border-slate-100 md:pl-6">
              <div className="text-3xl font-bold">30 min</div>
              <div className="text-xs text-slate-500">Average Setup Time</div>
            </div>
            <div className="space-y-1 md:border-l md:border-slate-100 md:pl-6">
              <div className="text-3xl font-bold">99.9%</div>
              <div className="text-xs text-slate-500">Uptime Guaranteed</div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          ref={featuresRef}
          className={`bg-white py-20 px-6 transition-all duration-700 ${
            featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center">
              <h2 className="text-3xl font-bold" style={{ color: '#1e293b' }}>
                Everything your business needs
              </h2>
              <p className="mt-2 text-slate-500">
                One system for attendance, shifts, payroll and reports
              </p>
            </div>
            <div className="mt-12 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">🔌</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Biometric Sync</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Connect ZKTeco or ESSL machine. Punch data syncs to cloud automatically. Zero
                  manual entry.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">⏱️</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Smart Attendance</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Daily and monthly view. Late deductions, overtime, lunch breaks calculated
                  automatically.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">💰</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">One-Click Payroll</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Complete salary for all employees in one click. Deductions, advances, incentives
                  — full breakdown.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">📋</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Shift Management</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Define timings, grace minutes, weekly offs and deduction rules once. Applied
                  fairly for all.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">📄</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Instant Reports</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Download attendance, payroll and overtime as CSV. Ready for accounts and audits
                  instantly.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
                <div className="text-3xl">💳</div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Advance Tracking</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Record salary advances per employee. Auto-deducted from that month&apos;s payroll.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          ref={howItWorksRef}
          className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
            howItWorksInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900">Up and running in 4 steps</h2>
              <p className="mt-2 text-slate-500">
                From signup to first payroll in under 30 minutes
              </p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-4 relative">
              <div className="hidden md:block absolute top-6 left-0 right-0 h-px border-t border-dashed border-slate-300 z-0" />
              {[
                {
                  number: 1,
                  title: 'Register & Get Approved',
                  desc: 'Sign up with company details. We approve within 2 hours.',
                },
                {
                  number: 2,
                  title: 'Add Employees & Shifts',
                  desc: 'Add staff, set salaries, assign shifts and weekly offs.',
                },
                {
                  number: 3,
                  title: 'Connect Your Device',
                  desc: 'Install connector on office PC. Biometric punches sync automatically.',
                },
                {
                  number: 4,
                  title: 'Generate Payroll',
                  desc: 'Click Generate Payroll at month end. Net salary calculated in seconds.',
                },
              ].map((step) => (
                <div
                  key={step.number}
                  className="relative z-10 flex flex-col items-start md:items-center text-left md:text-center gap-3"
                >
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg text-white mx-0 md:mx-auto"
                    style={{ backgroundColor: '#1a56db' }}
                  >
                    {step.number}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                  <p className="text-xs text-slate-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          ref={pricingRef}
          className={`bg-white py-20 px-6 transition-all duration-700 ${
            pricingInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900">Transparent Pricing</h2>
              <p className="mt-2 text-slate-500">
                One-time pricing with annual maintenance (AMC). No monthly subscriptions.
              </p>
            </div>

            <div className="mt-12 overflow-x-auto">
              <div className="min-w-[720px] rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-4 py-3 font-semibold">Slab</th>
                      <th className="px-4 py-3 font-semibold">Employees</th>
                      <th className="px-4 py-3 font-semibold">One-Time</th>
                      <th className="px-4 py-3 font-semibold">Annual AMC</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">Starter</td>
                      <td className="px-4 py-3 text-slate-700">Up to 50</td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">₹75,000</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium">₹12,000/year</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">Growth</td>
                      <td className="px-4 py-3 text-slate-700">Up to 150</td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">₹1,50,000</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium">₹20,000/year</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">Business</td>
                      <td className="px-4 py-3 text-slate-700">Up to 300</td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">₹2,50,000</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium">₹35,000/year</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-slate-900">Enterprise</td>
                      <td className="px-4 py-3 text-slate-700">300+</td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">₹3,50,000+</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium">₹50,000/year</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 text-center text-[11px] text-slate-500">
              Maintenance (AMC) is billed annually. Pricing above is the market rate; contact us for exact device/site requirements.
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section
          ref={testimonialsRef}
          className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
            testimonialsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900">
                Trusted by businesses across Tamil Nadu
              </h2>
              <p className="mt-2 text-slate-500">
                Join factories and shops already using PunchPay
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  quote:
                    'Finally a software that works with our existing biometric machine. Setup done in one visit and payroll now takes 5 minutes.',
                  name: 'Rajesh K.',
                  role: 'Textile Factory Owner, Tirupur',
                },
                {
                  quote:
                    'The founder came personally and set everything up. Very good support. 80 staff salary is now error-free every month.',
                  name: 'Murugan S.',
                  role: 'Garment Exporter, Coimbatore',
                },
                {
                  quote:
                    'Affordable price compared to other software. Biometric sync works perfectly. Reports are very useful for our accountant.',
                  name: 'Priya R.',
                  role: 'Retail Shop Owner, Udumalpet',
                },
                {
                  quote:
                    'PunchPay made attendance-to-payroll smooth for our team. Our monthly salary runs are quick and accurate.',
                  name: 'Anish Kumar',
                  role: 'Uma Traders, Udumalpet',
                },
                {
                  quote:
                    'Setup was fast and the team is responsive. PunchPay helps us stay organized with clear attendance and payroll reports.',
                  name: 'Badhurul Zaman',
                  role: 'Kuriinji Thunikkadai, Udumalpet',
                },
                {
                  quote:
                    'The reports are clean and easy for our accountant. Payroll generation happens in minutes every month.',
                  name: 'Vigneshwaran',
                  role: 'SSNV Spinning Mills, Udumlapet',
                },
              ].map((t) => (
                <article key={t.name} className="bg-white rounded-2xl p-6 shadow-sm">
                  <div className="text-yellow-400 text-sm mb-2">★★★★★</div>
                  <p className="text-sm text-slate-700 mb-4 leading-relaxed">{t.quote}</p>
                  <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.role}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Login section */}
        <section
          id="login-section"
          ref={loginRef}
          className={`bg-white py-20 px-6 transition-all duration-700 ${
            loginInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-900">Login to PunchPay</h2>
              <p className="mt-2 text-slate-500">
                New customer? Contact us on WhatsApp to get started.
              </p>
            </div>
            <div className="max-w-md mx-auto">
              <div className="rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
                <div className="flex items-center gap-2 mb-8">
                  <div className="h-10 w-10 rounded-2xl bg-primary-500 flex items-center justify-center text-white font-semibold">
                    A
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-slate-900">PunchPay</h1>
                    <p className="text-xs text-slate-500">Sign in to your account</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-blue-600 text-white font-medium py-2.5 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Login'}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-600">
                  Don’t have a company?{' '}
                  <Link to="/register" className="text-blue-600 font-medium hover:underline">
                    Register
                  </Link>
                </p>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Super admin?{' '}
                  <Link to="/admin" className="text-slate-600 font-medium hover:underline">
                    Manage pending registrations
                  </Link>
                </p>
              </div>

              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="mt-6 mx-auto block w-fit bg-[#25D366] text-white rounded-xl px-6 py-3 text-sm font-semibold shadow-md hover:brightness-110"
              >
                💬 New customer? Chat with us on WhatsApp →
              </a>
            </div>
          </div>
        </section>

        {/* Demo request */}
        <section
          id="demo"
          ref={demoRef}
          className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
            demoInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-900">Want a free demo?</h2>
              <p className="mt-2 text-slate-500">
                We&apos;ll come to your office and show you everything. No commitment needed.
              </p>
            </div>
            <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-8">
              {!demoSubmitted ? (
                <form onSubmit={handleDemoSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={demoName}
                      onChange={(e) => setDemoName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={demoBusiness}
                      onChange={(e) => setDemoBusiness(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={demoPhone}
                      onChange={(e) => setDemoPhone(e.target.value)}
                      placeholder="98765 43210"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Number of Employees
                    </label>
                    <select
                      value={demoEmployees}
                      onChange={(e) => setDemoEmployees(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    >
                      <option value="">Select employee count</option>
                      <option value="up-to-50">Up to 50</option>
                      <option value="up-to-150">Up to 150</option>
                      <option value="up-to-300">Up to 300</option>
                      <option value="300+">300+</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#1a56db] text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700"
                    disabled={demoSubmitting}
                  >
                    {demoSubmitting ? 'Requesting...' : 'Request Free Demo →'}
                  </button>
                  {demoError && (
                    <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {demoError}
                    </div>
                  )}
                </form>
              ) : (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 text-2xl">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Thank you {demoName || 'there'}!
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      We&apos;ll WhatsApp you within 2 hours to schedule your demo.
                    </p>
                  </div>
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-[#25D366] text-white px-6 py-3 text-sm font-semibold shadow-md hover:brightness-110"
                  >
                    Chat with us on WhatsApp →
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#1e293b] text-white py-12 px-6">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-2xl font-bold" style={{ color: '#1a56db' }}>
              PunchPay
            </div>
            <div className="text-slate-400 text-sm mt-1">Punch in. Pay out.</div>
            <div className="text-slate-500 text-xs mt-2">
              Built for factories and shops across Tamil Nadu.
            </div>
            <div className="text-slate-600 text-xs mt-4">
              © 2025 PunchPay by MZone Technologies
            </div>
          </div>
          <div>
            <div className="text-slate-300 font-semibold text-sm mb-3">Product</div>
            <div className="flex flex-col gap-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => handleScrollToSection('features')}
                className="text-left hover:text-white"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => handleScrollToSection('how-it-works')}
                className="text-left hover:text-white"
              >
                How it Works
              </button>
              <button
                type="button"
                onClick={() => handleScrollToSection('pricing')}
                className="text-left hover:text-white"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => handleScrollToSection('login-section')}
                className="text-left hover:text-white"
              >
                Login
              </button>
            </div>
          </div>
          <div>
            <div className="text-slate-300 font-semibold text-sm mb-3">Contact</div>
            <div className="flex flex-col gap-2 text-xs text-slate-400">
              <div>📱 WhatsApp: +{WHATSAPP_NUMBER}</div>
              <div>📧 info@mzonetechnologies.com</div>
              <div>🌐 punchpay.in</div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-700 mt-8 pt-6 text-center text-slate-500 text-xs">
          Made with ❤️ in Tamil Nadu 🇮🇳
        </div>
      </footer>

      {/* Floating WhatsApp button */}
      <a
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center text-2xl shadow-lg hover:scale-110 transition-transform"
        title="Chat with us"
      >
        💬
      </a>
    </div>
  );
}

