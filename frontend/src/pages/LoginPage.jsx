// import { useEffect, useRef, useState } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import { useAuth } from '../context/AuthContext';
// import { API_BASE } from '../utils/apiBase';

// const WHATSAPP_NUMBER = '919600844041';
// const WHATSAPP_LINK =
//   'https://wa.me/919600844041?text=Hi%2C%20I%20want%20to%20try%20PunchPay%20for%20my%20business';

// const useInView = (ref) => {
//   const [inView, setInView] = useState(false);

//   useEffect(() => {
//     const observer = new IntersectionObserver(
//       ([entry]) => {
//         if (entry.isIntersecting) {
//           setInView(true);
//         }
//       },
//       { threshold: 0.1 }
//     );

//     if (ref.current) {
//       observer.observe(ref.current);
//     }

//     return () => {
//       observer.disconnect();
//     };
//   }, [ref]);

//   return inView;
// };

// export default function LoginPage() {
//   const navigate = useNavigate();
//   const { setToken: setAuthToken } = useAuth();
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(false);

//   const [demoSubmitted, setDemoSubmitted] = useState(false);
//   const [demoName, setDemoName] = useState('');
//   const [demoBusiness, setDemoBusiness] = useState('');
//   const [demoPhone, setDemoPhone] = useState('');
//   const [demoEmployees, setDemoEmployees] = useState('');
//   const [demoSubmitting, setDemoSubmitting] = useState(false);
//   const [demoError, setDemoError] = useState('');

//   const heroRef = useRef(null);
//   const statsRef = useRef(null);
//   const featuresRef = useRef(null);
//   const howItWorksRef = useRef(null);
//   const pricingRef = useRef(null);
//   const testimonialsRef = useRef(null);
//   const loginRef = useRef(null);
//   const demoRef = useRef(null);

//   const heroInView = useInView(heroRef);
//   const statsInView = useInView(statsRef);
//   const featuresInView = useInView(featuresRef);
//   const howItWorksInView = useInView(howItWorksRef);
//   const pricingInView = useInView(pricingRef);
//   const testimonialsInView = useInView(testimonialsRef);
//   const loginInView = useInView(loginRef);
//   const demoInView = useInView(demoRef);

//   useEffect(() => {
//     const previousScrollBehavior = document.documentElement.style.scrollBehavior;
//     document.documentElement.style.scrollBehavior = 'smooth';
//     return () => {
//       document.documentElement.style.scrollBehavior = previousScrollBehavior;
//     };
//   }, []);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setLoading(true);
//     try {
//       const res = await fetch(`${API_BASE}/api/auth/login`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           email: email.trim(),
//           password,
//         }),
//       });
//       const json = await res.json();
//       if (!res.ok) {
//         setError(json.message || 'Login failed');
//         return;
//       }
//       const token = json.data?.token;
//       const userData = json.data?.user;
//       if (token) {
//         setAuthToken(
//           token,
//           userData
//             ? {
//                 user_id: userData.id,
//                 company_id: userData.company_id,
//                 email: userData.email,
//                 role: userData.role,
//               }
//             : null
//         );
//         navigate('/attendance', { replace: true });
//       } else {
//         setError('Invalid response from server');
//       }
//     } catch (err) {
//       setError(err.message || 'Login failed');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleScrollToSection = (id) => {
//     const el = document.getElementById(id);
//     if (el) {
//       el.scrollIntoView({ behavior: 'smooth' });
//     }
//   };

//   const handleDemoSubmit = async (e) => {
//     e.preventDefault();
//     setDemoError('');
//     setDemoSubmitting(true);
//     try {
//       const payload = {
//         full_name: demoName.trim(),
//         business_name: demoBusiness.trim(),
//         phone_number: demoPhone.trim(),
//         employees_range: demoEmployees,
//       };

//       const res = await fetch(`${API_BASE}/api/demo-enquiries`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload),
//       });

//       const json = await res.json().catch(() => ({}));
//       if (!res.ok) {
//         throw new Error(json.message || 'Failed to request demo');
//       }

//       setDemoSubmitted(true);
//     } catch (err) {
//       setDemoError(err.message || 'Failed to request demo');
//     } finally {
//       setDemoSubmitting(false);
//     }
//   };

//   return (
//     <div className="bg-white text-slate-900">
//       {/* Navbar */}
//       <header className="fixed top-0 inset-x-0 z-50 bg-white shadow-sm">
//         <div className="h-16 flex items-center justify-between px-6 max-w-7xl mx-auto">
//           <div>
//             <div className="text-2xl font-bold" style={{ color: '#1a56db' }}>
//               PunchPay
//             </div>
//             <div className="text-xs text-slate-400">Punch in. Pay out.</div>
//           </div>
//           <nav className="flex items-center gap-6">
//             <div className="hidden md:flex items-center gap-6 text-sm">
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('features')}
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Features
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('how-it-works')}
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 How it Works
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('pricing')}
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Pricing
//               </button>
//             </div>
//             <button
//               type="button"
//               onClick={() => handleScrollToSection('login-section')}
//               className="rounded-lg border border-blue-600 text-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-50"
//             >
//               Login
//             </button>
//           </nav>
//         </div>
//       </header>

//       <main className="pt-16">
//         {/* Hero */}
//         <section
//           ref={heroRef}
//           id="hero"
//           className="min-h-screen flex items-center bg-[#f0f9ff] px-6"
//         >
//           <div
//             className={`w-full max-w-7xl mx-auto grid gap-12 lg:grid-cols-2 items-center transition-all duration-700 ${
//               heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//             }`}
//           >
//             <div>
//               <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-100 mb-4">
//                 <span className="mr-1">🇮🇳</span> Made for Indian Businesses
//               </div>
//               <h1 className="font-bold leading-tight text-3xl sm:text-4xl lg:text-5xl">
//                 <span style={{ color: '#1a56db' }}>Punch in.</span>{' '}
//                 <span style={{ color: '#1e293b' }}>Pay out.</span>
//               </h1>
//               <p className="mt-4 text-xl text-slate-600 max-w-xl">
//                 Attendance tracking + payroll for factories and shops. Connect your biometric
//                 machine. Generate salary in one click.
//               </p>
//               <div className="mt-8 flex flex-wrap gap-4">
//                 <button
//                   type="button"
//                   onClick={() => handleScrollToSection('login-section')}
//                   className="bg-[#1a56db] text-white px-6 py-3 rounded-xl font-semibold shadow-sm hover:bg-blue-700"
//                 >
//                   Get Started →
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => handleScrollToSection('how-it-works')}
//                   className="border border-[#1a56db] text-[#1a56db] px-6 py-3 rounded-xl font-semibold bg-white hover:bg-slate-50"
//                 >
//                   See How It Works
//                 </button>
//               </div>
//               <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
//                 <div className="flex items-center gap-1">
//                   <span>✓</span> No credit card needed
//                 </div>
//                 <div className="flex items-center gap-1">
//                   <span>✓</span> Setup in 30 minutes
//                 </div>
//                 <div className="flex items-center gap-1">
//                   <span>✓</span> Local support
//                 </div>
//               </div>
//             </div>

//             <div className="hidden lg:block">
//               <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 max-w-md ml-auto">
//                 <div className="flex items-center justify-between mb-4">
//                   <div>
//                     <div className="text-sm font-medium text-slate-900">PunchPay Attendance</div>
//                     <div className="text-xs text-slate-500">Live attendance overview</div>
//                   </div>
//                   <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
//                     A
//                   </div>
//                 </div>
//                 <div className="grid grid-cols-3 gap-3 mb-6 text-xs">
//                   <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
//                     <div className="text-[10px] text-emerald-600 uppercase tracking-wide">
//                       Present Today
//                     </div>
//                     <div className="mt-1 text-sm font-semibold text-emerald-700">42 / 50</div>
//                   </div>
//                   <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2">
//                     <div className="text-[10px] text-rose-600 uppercase tracking-wide">Absent</div>
//                     <div className="mt-1 text-sm font-semibold text-rose-700">8</div>
//                   </div>
//                   <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
//                     <div className="text-[10px] text-amber-600 uppercase tracking-wide">
//                       On Leave
//                     </div>
//                     <div className="mt-1 text-sm font-semibold text-amber-700">2</div>
//                   </div>
//                 </div>
//                 <div className="mb-6">
//                   <div className="flex items-center justify-between mb-2">
//                     <div className="text-xs font-medium text-slate-700">This Week Attendance</div>
//                     <div className="text-[11px] text-slate-400">Mon – Sun</div>
//                   </div>
//                   <div className="h-32 flex items-end gap-2">
//                     {[70, 85, 90, 95, 80, 75, 88].map((value, idx) => (
//                       <div key={idx} className="flex-1 flex flex-col items-center gap-1">
//                         <div className="w-full rounded-full bg-blue-100 overflow-hidden h-24 flex items-end">
//                           <div
//                             className="w-full bg-blue-500 rounded-full transition-all"
//                             style={{ height: `${value}%` }}
//                           />
//                         </div>
//                         <div className="text-[11px] text-slate-500">
//                           {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx]}
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//                 <div className="flex items-center justify-between">
//                   <div className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-700">
//                     Payroll Ready ✓
//                   </div>
//                   <div className="text-[11px] text-slate-400">
//                     Next payout:{' '}
//                     <span className="font-medium text-slate-600">30th of this month</span>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </section>

//         {/* Stats Bar */}
//         <section
//           ref={statsRef}
//           className={`bg-white border-y border-slate-100 py-10 px-6 transition-all duration-700 ${
//             statsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
//             <div className="space-y-1">
//               <div className="text-3xl font-bold">50+</div>
//               <div className="text-xs text-slate-500">Businesses Using PunchPay</div>
//             </div>
//             <div className="space-y-1 border-l md:border-l md:border-slate-100 md:pl-6">
//               <div className="text-3xl font-bold">10,000+</div>
//               <div className="text-xs text-slate-500">Employees Tracked</div>
//             </div>
//             <div className="space-y-1 md:border-l md:border-slate-100 md:pl-6">
//               <div className="text-3xl font-bold">30 min</div>
//               <div className="text-xs text-slate-500">Average Setup Time</div>
//             </div>
//             <div className="space-y-1 md:border-l md:border-slate-100 md:pl-6">
//               <div className="text-3xl font-bold">99.9%</div>
//               <div className="text-xs text-slate-500">Uptime Guaranteed</div>
//             </div>
//           </div>
//         </section>

//         {/* Features */}
//         <section
//           id="features"
//           ref={featuresRef}
//           className={`bg-white py-20 px-6 transition-all duration-700 ${
//             featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-6xl mx-auto">
//             <div className="text-center">
//               <h2 className="text-3xl font-bold" style={{ color: '#1e293b' }}>
//                 Everything your business needs
//               </h2>
//               <p className="mt-2 text-slate-500">
//                 One system for attendance, shifts, payroll and reports
//               </p>
//             </div>
//             <div className="mt-12 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">🔌</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">Biometric Sync</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Connect ZKTeco or ESSL machine. Punch data syncs to cloud automatically. Zero
//                   manual entry.
//                 </p>
//               </div>
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">⏱️</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">Smart Attendance</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Daily and monthly view. Late deductions, overtime, lunch breaks calculated
//                   automatically.
//                 </p>
//               </div>
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">💰</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">One-Click Payroll</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Complete salary for all employees in one click. Deductions, advances, incentives
//                   — full breakdown.
//                 </p>
//               </div>
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">📋</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">Shift Management</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Define timings, grace minutes, weekly offs and deduction rules once. Applied
//                   fairly for all.
//                 </p>
//               </div>
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">📄</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">Instant Reports</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Download attendance, payroll and overtime as CSV. Ready for accounts and audits
//                   instantly.
//                 </p>
//               </div>
//               <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md border-l-4 border-l-[#1a56db] transition-all">
//                 <div className="text-3xl">💳</div>
//                 <h3 className="mt-3 text-lg font-bold text-slate-900">Advance Tracking</h3>
//                 <p className="mt-2 text-sm text-slate-600">
//                   Record salary advances per employee. Auto-deducted from that month&apos;s payroll.
//                 </p>
//               </div>
//             </div>
//           </div>
//         </section>

//         {/* How it works */}
//         <section
//           id="how-it-works"
//           ref={howItWorksRef}
//           className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
//             howItWorksInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-6xl mx-auto">
//             <div className="text-center">
//               <h2 className="text-3xl font-bold text-slate-900">Up and running in 4 steps</h2>
//               <p className="mt-2 text-slate-500">
//                 From signup to first payroll in under 30 minutes
//               </p>
//             </div>
//             <div className="mt-12 grid gap-8 md:grid-cols-4 relative">
//               <div className="hidden md:block absolute top-6 left-0 right-0 h-px border-t border-dashed border-slate-300 z-0" />
//               {[
//                 {
//                   number: 1,
//                   title: 'Register & Get Approved',
//                   desc: 'Sign up with company details. We approve within 2 hours.',
//                 },
//                 {
//                   number: 2,
//                   title: 'Add Employees & Shifts',
//                   desc: 'Add staff, set salaries, assign shifts and weekly offs.',
//                 },
//                 {
//                   number: 3,
//                   title: 'Connect Your Device',
//                   desc: 'Install connector on office PC. Biometric punches sync automatically.',
//                 },
//                 {
//                   number: 4,
//                   title: 'Generate Payroll',
//                   desc: 'Click Generate Payroll at month end. Net salary calculated in seconds.',
//                 },
//               ].map((step) => (
//                 <div
//                   key={step.number}
//                   className="relative z-10 flex flex-col items-start md:items-center text-left md:text-center gap-3"
//                 >
//                   <div
//                     className="flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg text-white mx-0 md:mx-auto"
//                     style={{ backgroundColor: '#1a56db' }}
//                   >
//                     {step.number}
//                   </div>
//                   <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
//                   <p className="text-xs text-slate-600">{step.desc}</p>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         {/* Pricing */}
//         <section
//           id="pricing"
//           ref={pricingRef}
//           className={`bg-white py-20 px-6 transition-all duration-700 ${
//             pricingInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-6xl mx-auto">
//             <div className="text-center">
//               <h2 className="text-3xl font-bold text-slate-900">Transparent Pricing</h2>
//               <p className="mt-2 text-slate-500">
//                 One-time pricing with annual maintenance (AMC). No monthly subscriptions.
//               </p>
//             </div>

//             <div className="mt-12 overflow-x-auto">
//               <div className="min-w-[720px] rounded-2xl border border-slate-200 bg-white shadow-sm">
//                 <table className="w-full text-xs">
//                   <thead>
//                     <tr className="border-b border-slate-200 text-left text-slate-600">
//                       <th className="px-4 py-3 font-semibold">Slab</th>
//                       <th className="px-4 py-3 font-semibold">Employees</th>
//                       <th className="px-4 py-3 font-semibold">One-Time</th>
//                       <th className="px-4 py-3 font-semibold">Annual AMC</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     <tr className="border-b border-slate-100">
//                       <td className="px-4 py-3 font-semibold text-slate-900">Starter</td>
//                       <td className="px-4 py-3 text-slate-700">Up to 50</td>
//                       <td className="px-4 py-3 text-slate-900 font-semibold">₹75,000</td>
//                       <td className="px-4 py-3 text-emerald-700 font-medium">₹12,000/year</td>
//                     </tr>
//                     <tr className="border-b border-slate-100">
//                       <td className="px-4 py-3 font-semibold text-slate-900">Growth</td>
//                       <td className="px-4 py-3 text-slate-700">Up to 150</td>
//                       <td className="px-4 py-3 text-slate-900 font-semibold">₹1,50,000</td>
//                       <td className="px-4 py-3 text-emerald-700 font-medium">₹20,000/year</td>
//                     </tr>
//                     <tr className="border-b border-slate-100">
//                       <td className="px-4 py-3 font-semibold text-slate-900">Business</td>
//                       <td className="px-4 py-3 text-slate-700">Up to 300</td>
//                       <td className="px-4 py-3 text-slate-900 font-semibold">₹2,50,000</td>
//                       <td className="px-4 py-3 text-emerald-700 font-medium">₹35,000/year</td>
//                     </tr>
//                     <tr>
//                       <td className="px-4 py-3 font-semibold text-slate-900">Enterprise</td>
//                       <td className="px-4 py-3 text-slate-700">300+</td>
//                       <td className="px-4 py-3 text-slate-900 font-semibold">₹3,50,000+</td>
//                       <td className="px-4 py-3 text-emerald-700 font-medium">₹50,000/year</td>
//                     </tr>
//                   </tbody>
//                 </table>
//               </div>
//             </div>

//             <div className="mt-5 text-center text-[11px] text-slate-500">
//               Maintenance (AMC) is billed annually. Pricing above is the market rate; contact us for exact device/site requirements.
//             </div>
//           </div>
//         </section>

//         {/* Testimonials */}
//         <section
//           ref={testimonialsRef}
//           className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
//             testimonialsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-6xl mx-auto">
//             <div className="text-center">
//               <h2 className="text-3xl font-bold text-slate-900">
//                 Trusted by businesses across Tamil Nadu
//               </h2>
//               <p className="mt-2 text-slate-500">
//                 Join factories and shops already using PunchPay
//               </p>
//             </div>
//             <div className="mt-12 grid gap-6 md:grid-cols-3">
//               {[
//                 {
//                   quote:
//                     'Finally a software that works with our existing biometric machine. Setup done in one visit and payroll now takes 5 minutes.',
//                   name: 'Rajesh K.',
//                   role: 'Textile Factory Owner, Tirupur',
//                 },
//                 {
//                   quote:
//                     'The founder came personally and set everything up. Very good support. 80 staff salary is now error-free every month.',
//                   name: 'Murugan S.',
//                   role: 'Garment Exporter, Coimbatore',
//                 },
//                 {
//                   quote:
//                     'Affordable price compared to other software. Biometric sync works perfectly. Reports are very useful for our accountant.',
//                   name: 'Priya R.',
//                   role: 'Retail Shop Owner, Udumalpet',
//                 },
//                 {
//                   quote:
//                     'PunchPay made attendance-to-payroll smooth for our team. Our monthly salary runs are quick and accurate.',
//                   name: 'Anish Kumar',
//                   role: 'Uma Traders, Udumalpet',
//                 },
//                 {
//                   quote:
//                     'Setup was fast and the team is responsive. PunchPay helps us stay organized with clear attendance and payroll reports.',
//                   name: 'Badhurul Zaman',
//                   role: 'Kuriinji Thunikkadai, Udumalpet',
//                 },
//                 {
//                   quote:
//                     'The reports are clean and easy for our accountant. Payroll generation happens in minutes every month.',
//                   name: 'Vigneshwaran',
//                   role: 'SSNV Spinning Mills, Udumlapet',
//                 },
//               ].map((t) => (
//                 <article key={t.name} className="bg-white rounded-2xl p-6 shadow-sm">
//                   <div className="text-yellow-400 text-sm mb-2">★★★★★</div>
//                   <p className="text-sm text-slate-700 mb-4 leading-relaxed">{t.quote}</p>
//                   <div className="text-sm font-semibold text-slate-900">{t.name}</div>
//                   <div className="text-xs text-slate-500">{t.role}</div>
//                 </article>
//               ))}
//             </div>
//           </div>
//         </section>

//         {/* Login section */}
//         <section
//           id="login-section"
//           ref={loginRef}
//           className={`bg-white py-20 px-6 transition-all duration-700 ${
//             loginInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-6xl mx-auto">
//             <div className="text-center mb-10">
//               <h2 className="text-3xl font-bold text-slate-900">Login to PunchPay</h2>
//               <p className="mt-2 text-slate-500">
//                 New customer? Contact us on WhatsApp to get started.
//               </p>
//             </div>
//             <div className="max-w-md mx-auto">
//               <div className="rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
//                 <div className="flex items-center gap-2 mb-8">
//                   <div className="h-10 w-10 rounded-2xl bg-primary-500 flex items-center justify-center text-white font-semibold">
//                     A
//                   </div>
//                   <div>
//                     <h1 className="text-lg font-semibold text-slate-900">PunchPay</h1>
//                     <p className="text-xs text-slate-500">Sign in to your account</p>
//                   </div>
//                 </div>

//                 <form onSubmit={handleSubmit} className="space-y-4">
//                   {error && (
//                     <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
//                       {error}
//                     </div>
//                   )}
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
//                     <input
//                       type="email"
//                       value={email}
//                       onChange={(e) => setEmail(e.target.value)}
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       placeholder="you@company.com"
//                       required
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Password
//                     </label>
//                     <input
//                       type="password"
//                       value={password}
//                       onChange={(e) => setPassword(e.target.value)}
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       required
//                     />
//                   </div>
//                   <button
//                     type="submit"
//                     disabled={loading}
//                     className="w-full rounded-lg bg-blue-600 text-white font-medium py-2.5 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
//                   >
//                     {loading ? 'Signing in…' : 'Login'}
//                   </button>
//                   <p className="text-center text-xs text-slate-500">
//                     Forgot password?{' '}
//                     <a
//                       href={WHATSAPP_LINK}
//                       target="_blank"
//                       rel="noreferrer"
//                       className="text-blue-600 font-medium hover:underline"
//                     >
//                       Contact support
//                     </a>
//                   </p>
//                 </form>

//                 <p className="mt-6 text-center text-sm text-slate-600">
//                   Don’t have a company?{' '}
//                   <Link to="/register" className="text-blue-600 font-medium hover:underline">
//                     Register
//                   </Link>
//                 </p>
//                 <p className="mt-2 text-center text-xs text-slate-500">
//                   Super admin?{' '}
//                   <Link to="/admin" className="text-slate-600 font-medium hover:underline">
//                     Manage pending registrations
//                   </Link>
//                 </p>
//               </div>

//               <a
//                 href={WHATSAPP_LINK}
//                 target="_blank"
//                 rel="noreferrer"
//                 className="mt-6 mx-auto block w-fit bg-[#25D366] text-white rounded-xl px-6 py-3 text-sm font-semibold shadow-md hover:brightness-110"
//               >
//                 💬 New customer? Chat with us on WhatsApp →
//               </a>
//             </div>
//           </div>
//         </section>

//         {/* Demo request */}
//         <section
//           id="demo"
//           ref={demoRef}
//           className={`bg-[#f0f9ff] py-20 px-6 transition-all duration-700 ${
//             demoInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
//           }`}
//         >
//           <div className="max-w-4xl mx-auto">
//             <div className="text-center mb-10">
//               <h2 className="text-3xl font-bold text-slate-900">Want a free demo?</h2>
//               <p className="mt-2 text-slate-500">
//                 We&apos;ll come to your office and show you everything. No commitment needed.
//               </p>
//             </div>
//             <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-8">
//               {!demoSubmitted ? (
//                 <form onSubmit={handleDemoSubmit} className="space-y-4">
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Full Name
//                     </label>
//                     <input
//                       type="text"
//                       value={demoName}
//                       onChange={(e) => setDemoName(e.target.value)}
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       required
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Business Name
//                     </label>
//                     <input
//                       type="text"
//                       value={demoBusiness}
//                       onChange={(e) => setDemoBusiness(e.target.value)}
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       required
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Phone Number
//                     </label>
//                     <input
//                       type="tel"
//                       value={demoPhone}
//                       onChange={(e) => setDemoPhone(e.target.value)}
//                       placeholder="98765 43210"
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       required
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Number of Employees
//                     </label>
//                     <select
//                       value={demoEmployees}
//                       onChange={(e) => setDemoEmployees(e.target.value)}
//                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
//                       required
//                     >
//                       <option value="">Select employee count</option>
//                       <option value="up-to-50">Up to 50</option>
//                       <option value="up-to-150">Up to 150</option>
//                       <option value="up-to-300">Up to 300</option>
//                       <option value="300+">300+</option>
//                     </select>
//                   </div>
//                   <button
//                     type="submit"
//                     className="w-full bg-[#1a56db] text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700"
//                     disabled={demoSubmitting}
//                   >
//                     {demoSubmitting ? 'Requesting...' : 'Request Free Demo →'}
//                   </button>
//                   {demoError && (
//                     <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
//                       {demoError}
//                     </div>
//                   )}
//                 </form>
//               ) : (
//                 <div className="text-center space-y-4">
//                   <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 text-2xl">
//                     ✓
//                   </div>
//                   <div>
//                     <h3 className="text-lg font-semibold text-slate-900">
//                       Thank you {demoName || 'there'}!
//                     </h3>
//                     <p className="mt-2 text-sm text-slate-600">
//                       We&apos;ll WhatsApp you within 2 hours to schedule your demo.
//                     </p>
//                   </div>
//                   <a
//                     href={WHATSAPP_LINK}
//                     target="_blank"
//                     rel="noreferrer"
//                     className="inline-flex items-center justify-center rounded-xl bg-[#25D366] text-white px-6 py-3 text-sm font-semibold shadow-md hover:brightness-110"
//                   >
//                     Chat with us on WhatsApp →
//                   </a>
//                 </div>
//               )}
//             </div>
//           </div>
//         </section>
//       </main>

//       {/* Footer */}
//       <footer className="bg-[#1e293b] text-white py-12 px-6">
//         <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-3">
//           <div>
//             <div className="text-2xl font-bold" style={{ color: '#1a56db' }}>
//               PunchPay
//             </div>
//             <div className="text-slate-400 text-sm mt-1">Punch in. Pay out.</div>
//             <div className="text-slate-500 text-xs mt-2">
//               Built for factories and shops across Tamil Nadu.
//             </div>
//             <div className="text-slate-600 text-xs mt-4">
//               © 2025 PunchPay by MZone Technologies
//             </div>
//           </div>
//           <div>
//             <div className="text-slate-300 font-semibold text-sm mb-3">Product</div>
//             <div className="flex flex-col gap-2 text-xs text-slate-400">
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('features')}
//                 className="text-left hover:text-white"
//               >
//                 Features
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('how-it-works')}
//                 className="text-left hover:text-white"
//               >
//                 How it Works
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('pricing')}
//                 className="text-left hover:text-white"
//               >
//                 Pricing
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleScrollToSection('login-section')}
//                 className="text-left hover:text-white"
//               >
//                 Login
//               </button>
//             </div>
//           </div>
//           <div>
//             <div className="text-slate-300 font-semibold text-sm mb-3">Contact</div>
//             <div className="flex flex-col gap-2 text-xs text-slate-400">
//               <div>📱 WhatsApp: +{WHATSAPP_NUMBER}</div>
//               <div>📧 info@mzonetechnologies.com</div>
//               <div>🌐 punchpay.in</div>
//             </div>
//           </div>
//         </div>
//         <div className="border-t border-slate-700 mt-8 pt-6 text-center text-slate-500 text-xs">
//           Made with ❤️ in Tamil Nadu 🇮🇳
//         </div>
//       </footer>

//       {/* Floating WhatsApp button */}
//       <a
//         href={WHATSAPP_LINK}
//         target="_blank"
//         rel="noreferrer"
//         className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center text-2xl shadow-lg hover:scale-110 transition-transform"
//         title="Chat with us"
//       >
//         💬
//       </a>
//     </div>
//   );
// }


import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/apiBase';
import { PRICING_PLANS } from '../constants/pricingPlans';

const WHATSAPP_NUMBER = '919600844041';
const WHATSAPP_LINK =
  'https://wa.me/919600844041?text=Hi%2C%20I%20want%20to%20try%20PunchPay%20for%20my%20business';

/* ── Google Fonts injected once ── */
if (!document.getElementById('pp-fonts')) {
  const link = document.createElement('link');
  link.id = 'pp-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap';
  document.head.appendChild(link);
}

/* ── CSS variables injected once ── */
if (!document.getElementById('pp-vars')) {
  const style = document.createElement('style');
  style.id = 'pp-vars';
  style.textContent = `
    :root {
      --pp-black: #0A0A0A;
      --pp-gold: #D4A843;
      --pp-gold-light: #F0C96A;
      --pp-gold-dim: #A07820;
      --pp-white: #F5F1EA;
      --pp-white-dim: #C8C0B0;
      --pp-card: #111111;
      --pp-border: rgba(212,168,67,0.2);
      --pp-red: #C0392B;
      --pp-green: #27ae60;
    }
    .pp-syne { font-family: 'Syne', sans-serif !important; }
    .pp-dm   { font-family: 'DM Sans', sans-serif !important; }

    /* scrollbar */
    html { scroll-behavior: smooth; }

    /* fade-up animation */
    @keyframes ppFadeUp {
      from { opacity: 0; transform: translateY(28px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .pp-fade-up { animation: ppFadeUp 0.65s ease both; }
    .pp-delay-1 { animation-delay: 0.1s; }
    .pp-delay-2 { animation-delay: 0.22s; }
    .pp-delay-3 { animation-delay: 0.34s; }
    .pp-delay-4 { animation-delay: 0.46s; }

    /* noise overlay */
    .pp-noise::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    /* gold button */
    .pp-btn-gold {
      background: var(--pp-gold);
      color: var(--pp-black);
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 13px 26px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      display: inline-block;
      transition: filter 0.2s, transform 0.15s;
    }
    .pp-btn-gold:hover { filter: brightness(1.1); transform: translateY(-1px); }

    /* ghost button */
    .pp-btn-ghost {
      background: transparent;
      color: var(--pp-gold);
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 12px 26px;
      border-radius: 7px;
      border: 1.5px solid var(--pp-gold);
      cursor: pointer;
      display: inline-block;
      transition: background 0.2s;
    }
    .pp-btn-ghost:hover { background: rgba(212,168,67,0.08); }

    /* card */
    .pp-card {
      background: var(--pp-card);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
    }
    .pp-card-gold {
      background: linear-gradient(135deg, #161200, var(--pp-card));
      border: 1px solid var(--pp-border);
      border-radius: 14px;
    }

    /* input */
    .pp-input {
      width: 100%;
      background: #0f0f0f;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: var(--pp-white);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      padding: 10px 14px;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .pp-input:focus { border-color: var(--pp-gold); }
    .pp-input option { background: #111; color: var(--pp-white); }

    /* nav link */
    .pp-nav-link {
      background: none;
      border: none;
      color: var(--pp-white-dim);
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      cursor: pointer;
      padding: 0;
      transition: color 0.2s;
    }
    .pp-nav-link:hover { color: var(--pp-gold); }

    /* section eyebrow */
    .pp-eyebrow {
      font-size: 10px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--pp-gold);
      font-weight: 600;
      margin-bottom: 10px;
      font-family: 'DM Sans', sans-serif;
    }

    /* divider */
    .pp-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 14px 0; }

    /* feature card hover */
    .pp-feat-card { transition: border-color 0.2s, transform 0.2s; }
    .pp-feat-card:hover { border-color: var(--pp-border) !important; transform: translateY(-2px); }

    /* plan card */
    .pp-plan { display: flex; flex-direction: column; }
    .pp-plan-feat { font-size: 11px; color: var(--pp-white-dim); padding: 3px 0; display: flex; align-items: flex-start; gap: 7px; line-height: 1.4; }
    .pp-plan-feat::before { content: '✓'; color: var(--pp-gold); font-weight: 700; flex-shrink: 0; }
    .pp-plan-feat.dim { color: rgba(255,255,255,0.25); }
    .pp-plan-feat.dim::before { color: rgba(255,255,255,0.15); content: '—'; }

    /* comparison table */
    .pp-cmp-th { padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; text-align: center; }
    .pp-cmp-td { padding: 10px 12px; text-align: center; font-size: 11px; }

    /* whatsapp float */
    .pp-wa-float {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #25D366; color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      text-decoration: none; transition: transform 0.2s;
    }
    .pp-wa-float:hover { transform: scale(1.1); }

    /* testimonial */
    .pp-testi { transition: border-color 0.2s; }
    .pp-testi:hover { border-color: var(--pp-border) !important; }

    /* step number */
    .pp-step-num {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--pp-black);
      border: 2px solid var(--pp-gold);
      font-family: 'Syne', sans-serif;
      font-size: 16px; font-weight: 800;
      color: var(--pp-gold);
      display: flex; align-items: center; justify-content: center;
      position: relative; z-index: 1;
    }
  `;
  document.head.appendChild(style);
}

/* ── InView hook ── */
const useInView = (ref) => {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
};

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function LoginPage() {
  const navigate = useNavigate();
  const { setToken: setAuthToken } = useAuth();

  /* ── login state ── */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /* ── demo state ── */
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoName, setDemoName] = useState('');
  const [demoBusiness, setDemoBusiness] = useState('');
  const [demoPhone, setDemoPhone] = useState('');
  const [demoEmployees, setDemoEmployees] = useState('');
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState('');

  /* ── section refs ── */
  const heroRef        = useRef(null);
  const statsRef       = useRef(null);
  const featuresRef    = useRef(null);
  const howItWorksRef  = useRef(null);
  const pricingRef     = useRef(null);
  const testimonialsRef= useRef(null);
  const loginRef       = useRef(null);
  const demoRef        = useRef(null);

  const heroInView         = useInView(heroRef);
  const statsInView        = useInView(statsRef);
  const featuresInView     = useInView(featuresRef);
  const howItWorksInView   = useInView(howItWorksRef);
  const pricingInView      = useInView(pricingRef);
  const testimonialsInView = useInView(testimonialsRef);
  const loginInView        = useInView(loginRef);
  const demoInView         = useInView(demoRef);

  /* ── handlers (unchanged logic) ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.message || 'Login failed'); return; }
      const token    = json.data?.token;
      const userData = json.data?.user;
      if (token) {
        setAuthToken(token, userData ? {
          user_id: userData.id, company_id: userData.company_id,
          email: userData.email, role: userData.role,
        } : null);
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
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setDemoError('');
    setDemoSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/demo-enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: demoName.trim(),
          business_name: demoBusiness.trim(),
          phone_number: demoPhone.trim(),
          employees_range: demoEmployees,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to request demo');
      setDemoSubmitted(true);
    } catch (err) {
      setDemoError(err.message || 'Failed to request demo');
    } finally {
      setDemoSubmitting(false);
    }
  };

  /* ── shared styles ── */
  const S = {
    page:     { background: 'var(--pp-black)', color: 'var(--pp-white)', fontFamily: "'DM Sans', sans-serif" },
    section:  (bg) => ({ background: bg || 'var(--pp-black)', padding: '80px 24px', position: 'relative' }),
    maxW:     { maxWidth: 1100, margin: '0 auto' },
    heading:  { fontFamily: "'Syne', sans-serif", fontWeight: 800, color: 'var(--pp-white)', letterSpacing: '-1px' },
    gold:     { color: 'var(--pp-gold)' },
    dim:      { color: 'var(--pp-white-dim)' },
    label:    { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pp-white-dim)', marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase' },
  };

  /* ── pricing data (shared with SuperAdmin plan codes) ── */
  const plans = PRICING_PLANS;

  /* ── comparison data ── */
  const cmpRows = [
    { emp: '25 Employees',  other_mo: '₹1,250/mo', other_3y: '₹45,000',   pp: '₹20,000 + ₹5k AMC',   pp_plan: 'Basic Plan',        pp_3y: '₹35,000',    save: '₹10,000' },
    { emp: '50 Employees',  other_mo: '₹2,500/mo', other_3y: '₹90,000',   pp: '₹35,000 + ₹8k AMC',   pp_plan: 'Growth Plan',       pp_3y: '₹59,000',    save: '₹31,000' },
    { emp: '100 Employees', other_mo: '₹5,000/mo', other_3y: '₹1,80,000', pp: '₹60,000 + ₹15k AMC',  pp_plan: 'Business Plan',     pp_3y: '₹1,05,000',  save: '₹75,000' },
    { emp: '200 Employees', other_mo: '₹10,000/mo',other_3y: '₹3,60,000', pp: '₹1,00,000 + ₹25k AMC',pp_plan: 'Professional Plan', pp_3y: '₹1,75,000',  save: '₹1,85,000' },
  ];

  return (
    <div style={S.page}>

      {/* ══ NAVBAR ══ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--pp-border)',
      }}>
        <div style={{ ...S.maxW, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          {/* logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, background: 'var(--pp-gold)', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div className="pp-syne" style={{ fontSize: 18, fontWeight: 800, color: 'var(--pp-white)', letterSpacing: '-0.5px' }}>
                Punch<span style={S.gold}>Pay</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--pp-gold-dim)', letterSpacing: '1px' }}>Punch in. Pay out.</div>
            </div>
          </div>

          {/* nav links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              {[['Features','features'],['How it Works','how-it-works'],['Pricing','pricing']].map(([label, id]) => (
                <button key={id} type="button" className="pp-nav-link" onClick={() => handleScrollToSection(id)}>{label}</button>
              ))}
            </div>
            <button type="button" className="pp-btn-gold" style={{ padding: '9px 20px', fontSize: 12 }} onClick={() => handleScrollToSection('login-section')}>
              Login
            </button>
          </nav>
        </div>
      </header>

      <main style={{ paddingTop: 64 }}>

        {/* ══ HERO ══ */}
        <section ref={heroRef} id="hero" className="pp-noise" style={{ ...S.section('var(--pp-black)'), minHeight: '92vh', display: 'flex', alignItems: 'center' }}>
          <div style={{ ...S.maxW, width: '100%' }}>
            <div className={heroInView ? 'pp-fade-up' : ''} style={{ maxWidth: 680 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(212,168,67,0.08)', border: '1px solid var(--pp-border)',
                borderRadius: 20, padding: '5px 14px', marginBottom: 24,
              }}>
                <span>🇮🇳</span>
                <span style={{ fontSize: 11, color: 'var(--pp-gold)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}>Made for Indian Businesses</span>
              </div>

              <h1 className="pp-syne" style={{ fontSize: 'clamp(40px,6vw,72px)', fontWeight: 800, lineHeight: 0.92, letterSpacing: '-3px', marginBottom: 24 }}>
                Run Your<br/>
                <span style={S.gold}>Payroll</span><br/>
                <span style={{ WebkitTextStroke: '2px var(--pp-white-dim)', color: 'transparent' }}>Effortlessly.</span>
              </h1>

              <p style={{ fontSize: 16, color: 'var(--pp-white-dim)', maxWidth: 480, lineHeight: 1.7, fontWeight: 300, marginBottom: 36 }}>
                Attendance tracking and payroll automation built for Tamil Nadu SMBs.
                Connect your biometric machine. Generate salary in one click.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
                <button type="button" className="pp-btn-gold" onClick={() => handleScrollToSection('demo')}>Get A Demo Today</button>
                <button type="button" className="pp-btn-ghost" onClick={() => handleScrollToSection('how-it-works')}>See How It Works</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {['No credit card needed','Setup in 30 minutes','Local support'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--pp-white-dim)' }}>
                    <span style={S.gold}>✓</span> {t}
                  </div>
                ))}
              </div>

              {/* contact chips */}
              <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
                {[
                  { name: 'Anish', num: '+91 98424 81388' },
                  { name: 'Thanveer', num: '+91 96008 44041' },
                ].map(c => (
                  <div key={c.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)',
                    borderRadius: 8, padding: '8px 14px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5.006L2 22l5.135-1.347A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                    <span style={{ fontSize: 12, color: 'var(--pp-white-dim)' }}>
                      {c.name}: <strong style={{ color: 'var(--pp-white)' }}>{c.num}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* subtle grid pattern */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: -1, opacity: 0.03,
            backgroundImage: 'linear-gradient(var(--pp-gold) 1px, transparent 1px), linear-gradient(90deg, var(--pp-gold) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
        </section>

        {/* ══ STATS BAR ══ */}
        <section ref={statsRef} style={{ background: '#0d0d0d', borderTop: '1px solid var(--pp-border)', borderBottom: '1px solid var(--pp-border)', padding: '28px 24px' }}>
          <div style={{ ...S.maxW, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
            {[
              { num: '50+', label: 'Businesses Using PunchPay' },
              { num: '10,000+', label: 'Employees Tracked' },
              { num: '30 min', label: 'Average Setup Time' },
              { num: '99.9%', label: 'Uptime Guaranteed' },
            ].map((s, i) => (
              <div key={s.label} className={statsInView ? `pp-fade-up pp-delay-${i+1}` : ''} style={{
                textAlign: 'center', borderRight: i < 3 ? '1px solid var(--pp-border)' : 'none', padding: '8px 0',
              }}>
                <div className="pp-syne" style={{ fontSize: 28, fontWeight: 800, color: 'var(--pp-gold)', letterSpacing: '-1px' }}>{s.num}</div>
                <div style={{ fontSize: 11, color: 'var(--pp-white-dim)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ FEATURES ══ */}
        <section id="features" ref={featuresRef} style={S.section()}>
          <div style={S.maxW}>
            <div className={featuresInView ? 'pp-fade-up' : ''} style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="pp-eyebrow">Everything You Need</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize: 36, marginBottom: 10 }}>Powerful Features,<br/>Simple to Use</h2>
              <p style={{ ...S.dim, fontSize: 14 }}>No HR software training needed. If you can use WhatsApp, you can use PunchPay.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { icon: '🔌', title: 'Biometric Sync',       desc: 'Connect ZKTeco or ESSL machine. Punch data syncs to cloud automatically. Zero manual entry.' },
                { icon: '⏱️', title: 'Smart Attendance',     desc: 'Daily and monthly view. Overtime, lunch breaks, half-day detection — calculated automatically.' },
                { icon: '💰', title: 'One-Click Payroll',    desc: 'Complete salary for all employees in one click. Deductions, advances, incentives — full breakdown.' },
                { icon: '📋', title: 'Multi-Branch Support', desc: 'Manage all branches from one dashboard. Each branch has its own attendance and payroll.' },
                { icon: '📄', title: 'PDF Reports',          desc: 'Download attendance, payroll and overtime as PDF. Ready for accounts and audits instantly.' },
                { icon: '💳', title: 'Advance Tracking',     desc: 'Record salary advances per employee. Auto-deducted from that month\'s payroll.' },
              ].map((f, i) => (
                <div key={f.title} className={`pp-card pp-feat-card ${featuresInView ? `pp-fade-up pp-delay-${(i%4)+1}` : ''}`} style={{ padding: 24 }}>
                  <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
                  <h3 className="pp-syne" style={{ fontSize: 15, fontWeight: 700, color: 'var(--pp-white)', marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--pp-white-dim)', lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ HOW IT WORKS ══ */}
        <section id="how-it-works" ref={howItWorksRef} style={{ ...S.section('#0d0d0d') }}>
          <div style={S.maxW}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="pp-eyebrow">Setup in Minutes</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize: 32 }}>Up and Running in 4 Steps</h2>
              <p style={{ ...S.dim, fontSize: 14, marginTop: 8 }}>From signup to first payroll in under 30 minutes</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, position: 'relative' }}>
              {/* connector line */}
              <div style={{ position: 'absolute', top: 21, left: '12.5%', right: '12.5%', height: 1, borderTop: '1px dashed var(--pp-border)' }} />
              {[
                { n:1, title:'Register & Get Approved', desc:'Sign up with company details. We approve within 2 hours.' },
                { n:2, title:'Add Employees & Shifts',  desc:'Add staff, set salaries, assign shifts and weekly offs.' },
                { n:3, title:'Connect Your Device',     desc:'Install connector on office PC. Biometric punches sync automatically.' },
                { n:4, title:'Generate Payroll',        desc:'Click Generate Payroll at month end. Net salary calculated in seconds.' },
              ].map((st, i) => (
                <div key={st.n} className={howItWorksInView ? `pp-fade-up pp-delay-${i+1}` : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 16px' }}>
                  <div className="pp-step-num" style={{ marginBottom: 16 }}>{st.n}</div>
                  <h4 className="pp-syne" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pp-white)', marginBottom: 8 }}>{st.title}</h4>
                  <p style={{ fontSize: 11.5, color: 'var(--pp-white-dim)', lineHeight: 1.6 }}>{st.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ PRICING ══ */}
        <section id="pricing" ref={pricingRef} style={S.section()}>
          <div style={S.maxW}>
            <div className={pricingInView ? 'pp-fade-up' : ''} style={{ textAlign: 'center', marginBottom: 8 }}>
              <div className="pp-eyebrow">Transparent Pricing</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize: 34, marginBottom: 8 }}>One-Time Price.<br/>No Subscriptions.</h2>
              <p style={{ ...S.dim, fontSize: 13 }}>Pay once, own it forever. AMC keeps your software updated. All prices exclude 18% GST.</p>
            </div>

            {/* plan cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginTop: 32 }}>
              {plans.map((p) => (
                <div key={p.code} style={{
                  background: p.popular ? 'linear-gradient(160deg,#1c1600,#111)' : 'var(--pp-card)',
                  border: p.popular ? '1px solid rgba(212,168,67,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14, padding: '14px 12px', display: 'flex', flexDirection: 'column',
                  position: 'relative',
                }}>
                  {p.popular && (
                    <div style={{
                      position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                      background: 'var(--pp-gold)', color: 'var(--pp-black)',
                      fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 800,
                      letterSpacing: '1px', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                    }}>★ Most Popular</div>
                  )}
                  <div className="pp-syne" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--pp-white-dim)', marginBottom: 8 }}>{p.name}</div>
                  <div className="pp-syne" style={{ fontSize: p.price === 'Custom' ? 18 : 20, fontWeight: 800, color: 'var(--pp-gold)', letterSpacing: '-1px', lineHeight: 1 }}>
                    {p.price === 'Custom' ? 'Custom' : <><span style={{ fontSize: 12, verticalAlign: 'top', marginTop: 3, display: 'inline-block' }}>₹</span>{p.price}</>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--pp-white-dim)', margin: '6px 0 8px' }}>{p.emp} Employees</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6, padding: '5px 8px', marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Annual AMC</div>
                    <div className="pp-syne" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pp-white)' }}>{p.amc === 'Custom' ? 'Custom' : `₹${p.amc} / year`}</div>
                  </div>
                  <div className="pp-divider" />
                  {p.features.map(f => <div key={f} className="pp-plan-feat">{f}</div>)}
                  {p.dimFeatures.map(f => <div key={f} className="pp-plan-feat dim">{f}</div>)}
                </div>
              ))}
            </div>

            {/* GST / branch note */}
            <div style={{
              marginTop: 14, padding: '13px 18px',
              background: 'rgba(212,168,67,0.06)', border: '1px solid var(--pp-border)',
              borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--pp-white-dim)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pp-gold)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>All prices are <strong style={{ color: 'var(--pp-white)' }}>exclusive of 18% GST</strong>, applicable on both one-time and AMC charges.
              For <strong style={{ color: 'var(--pp-white)' }}>multiple branches</strong>, pricing may vary — contact
              Anish: <strong style={S.gold}>+91 98424 81388</strong> / Thanveer: <strong style={S.gold}>+91 96008 44041</strong></span>
            </div>

            {/* ── comparison table ── */}
            <div style={{ marginTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="pp-eyebrow" style={{ marginBottom: 4 }}>Why PunchPay?</div>
                  <div className="pp-syne" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--pp-white)' }}>Pay Once. Save Every Month.</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--pp-white-dim)', textAlign: 'right', maxWidth: 240, lineHeight: 1.6 }}>
                  Others charge <strong style={{ color: '#e74c3c' }}>₹50/employee/month</strong> forever.<br/>PunchPay is a one-time investment.
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...{padding:'10px 12px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:'1px',fontWeight:700,color:'var(--pp-white-dim)'}, background:'rgba(255,255,255,0.04)', borderRadius:'8px 0 0 0' }}>Shop Size</th>
                    <th className="pp-cmp-th" style={{ background:'rgba(192,57,43,0.15)', color:'#e74c3c' }}>Other SaaS<br/><span style={{fontWeight:400,fontSize:9}}>(₹50/emp/month)</span></th>
                    <th className="pp-cmp-th" style={{ background:'rgba(192,57,43,0.1)', color:'#e74c3c' }}>3 Year Cost<br/><span style={{fontWeight:400,fontSize:9}}>(Other SaaS)</span></th>
                    <th className="pp-cmp-th" style={{ background:'rgba(212,168,67,0.12)', color:'var(--pp-gold)' }}>PunchPay<br/><span style={{fontWeight:400,fontSize:9}}>(One-time + AMC)</span></th>
                    <th className="pp-cmp-th" style={{ background:'rgba(212,168,67,0.12)', color:'var(--pp-gold)' }}>3 Year Cost<br/><span style={{fontWeight:400,fontSize:9}}>(PunchPay)</span></th>
                    <th className="pp-cmp-th" style={{ background:'rgba(39,174,96,0.15)', color:'#27ae60', borderRadius:'0 8px 0 0' }}>You Save</th>
                  </tr>
                </thead>
                <tbody>
                  {cmpRows.map((r, i) => (
                    <tr key={r.emp} style={{ borderBottom: i < cmpRows.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding:'10px 12px', color:'var(--pp-white)', fontWeight:600, fontSize:11 }}>{r.emp}</td>
                      <td className="pp-cmp-td" style={{ color:'#e74c3c' }}>{r.other_mo}<br/><span style={{fontSize:10,color:'rgba(255,255,255,0.3)'}}>₹{parseInt(r.other_mo.replace(/[₹,\/mo]/g,'').trim())*12}/yr</span></td>
                      <td className="pp-cmp-td" style={{ color:'#e74c3c', fontWeight:700 }}>{r.other_3y}</td>
                      <td className="pp-cmp-td" style={{ color:'var(--pp-gold)' }}>{r.pp}<br/><span style={{fontSize:10,color:'rgba(255,255,255,0.3)'}}>{r.pp_plan}</span></td>
                      <td className="pp-cmp-td" style={{ color:'var(--pp-gold)', fontWeight:700 }}>{r.pp_3y}</td>
                      <td className="pp-cmp-td pp-syne" style={{ color:'#27ae60', fontWeight:800 }}>{r.save}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop:10, padding:'10px 14px', background:'rgba(39,174,96,0.08)', border:'1px solid rgba(39,174,96,0.25)', borderRadius:8, fontSize:11, color:'var(--pp-white-dim)', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{fontSize:15}}>💡</span>
                <span><strong style={{color:'#27ae60'}}>PunchPay pays for itself within 2 years</strong> for any shop with 50+ employees — and keeps saving money every year after.</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══ TESTIMONIALS ══ */}
        <section ref={testimonialsRef} style={S.section('#0d0d0d')}>
          <div style={S.maxW}>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div className="pp-eyebrow">Trusted Across Tamil Nadu</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize:32 }}>What Our Clients Say</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {[
                { quote:'Finally a software that works with our existing biometric machine. Setup done in one visit and payroll now takes 5 minutes.', name:'Rajesh K.', role:'Textile Factory Owner, Tirupur' },
                { quote:'The founder came personally and set everything up. Very good support. 80 staff salary is now error-free every month.', name:'Murugan S.', role:'Garment Exporter, Coimbatore' },
                { quote:'Affordable price compared to other software. Biometric sync works perfectly. Reports are very useful for our accountant.', name:'Priya R.', role:'Retail Shop Owner, Udumalpet' },
                { quote:'PunchPay made attendance-to-payroll smooth for our team. Our monthly salary runs are quick and accurate.', name:'Anish Kumar', role:'Uma Traders, Udumalpet' },
                { quote:'Setup was fast and the team is responsive. PunchPay helps us stay organized with clear attendance and payroll reports.', name:'Badhurul Zaman', role:'Kuriinji Thunikkadai, Udumalpet' },
                { quote:'The reports are clean and easy for our accountant. Payroll generation happens in minutes every month.', name:'Vigneshwaran', role:'SSNV Spinning Mills, Udumalpet' },
              ].map((t, i) => (
                <article key={t.name} className={`pp-card pp-testi ${testimonialsInView ? `pp-fade-up pp-delay-${(i%4)+1}` : ''}`} style={{ padding:22 }}>
                  <div style={{ color:'var(--pp-gold)', fontSize:13, marginBottom:10 }}>★★★★★</div>
                  <p style={{ fontSize:12.5, color:'var(--pp-white-dim)', lineHeight:1.7, marginBottom:14 }}>{t.quote}</p>
                  <div className="pp-syne" style={{ fontSize:13, fontWeight:700, color:'var(--pp-white)' }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--pp-gold-dim)', marginTop:3 }}>{t.role}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══ LOGIN ══ */}
        <section id="login-section" ref={loginRef} style={S.section()}>
          <div style={S.maxW}>
            <div style={{ textAlign:'center', marginBottom:36 }}>
              <div className="pp-eyebrow">Existing Customers</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize:32, marginBottom:8 }}>Login to PunchPay</h2>
              <p style={{ ...S.dim, fontSize:13 }}>New customer? Contact us on WhatsApp to get started.</p>
            </div>

            <div style={{ maxWidth:420, margin:'0 auto' }}>
              <div className="pp-card-gold" style={{ padding:32 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28 }}>
                  <div style={{ width:40, height:40, background:'var(--pp-gold)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <div>
                    <div className="pp-syne" style={{ fontSize:16, fontWeight:800, color:'var(--pp-white)' }}>PunchPay</div>
                    <div style={{ fontSize:11, color:'var(--pp-white-dim)' }}>Sign in to your account</div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {error && (
                    <div style={{ fontSize:13, color:'#e74c3c', background:'rgba(192,57,43,0.1)', border:'1px solid rgba(192,57,43,0.3)', borderRadius:8, padding:'10px 14px' }}>
                      {error}
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Email</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="pp-input" placeholder="you@company.com" required />
                  </div>
                  <div>
                    <label style={S.label}>Password</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="pp-input" required />
                  </div>
                  <button type="submit" disabled={loading} className="pp-btn-gold" style={{ width:'100%', textAlign:'center', opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Signing in…' : 'Login'}
                  </button>
                  <p style={{ textAlign:'center', fontSize:12, color:'var(--pp-white-dim)' }}>
                    Forgot password?{' '}
                    <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" style={S.gold}>Contact support</a>
                  </p>
                </form>

                <div className="pp-divider" style={{ margin:'20px 0' }} />
                <p style={{ textAlign:'center', fontSize:13, color:'var(--pp-white-dim)' }}>
                  Don't have a company?{' '}
                  <Link to="/register" style={S.gold}>Register</Link>
                </p>
                <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:6 }}>
                  Super admin?{' '}
                  <Link to="/admin" style={{ color:'var(--pp-white-dim)' }}>Manage pending registrations</Link>
                </p>
              </div>

              <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" style={{
                marginTop:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                background:'#25D366', color:'#fff', borderRadius:10, padding:'13px 24px',
                fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13,
                textDecoration:'none', transition:'filter 0.2s',
              }}>
                💬 New customer? Chat with us on WhatsApp →
              </a>
            </div>
          </div>
        </section>

        {/* ══ DEMO ══ */}
        <section id="demo" ref={demoRef} style={S.section('#0d0d0d')}>
          <div style={S.maxW}>
            <div style={{ textAlign:'center', marginBottom:36 }}>
              <div className="pp-eyebrow">Free Demo</div>
              <h2 className="pp-syne" style={{ ...S.heading, fontSize:32, marginBottom:8 }}>Want a Free Demo?</h2>
              <p style={{ ...S.dim, fontSize:13 }}>We'll come to your office and show you everything. No commitment needed.</p>
            </div>

            <div style={{ maxWidth:480, margin:'0 auto' }}>
              <div className="pp-card-gold" style={{ padding:32 }}>
                {!demoSubmitted ? (
                  <form onSubmit={handleDemoSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    {[
                      { label:'Full Name',      type:'text',  val:demoName,     set:setDemoName,     ph:'' },
                      { label:'Business Name',  type:'text',  val:demoBusiness, set:setDemoBusiness, ph:'' },
                      { label:'Phone Number',   type:'tel',   val:demoPhone,    set:setDemoPhone,    ph:'98765 43210' },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={S.label}>{f.label}</label>
                        <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} className="pp-input" placeholder={f.ph} required />
                      </div>
                    ))}
                    <div>
                      <label style={S.label}>Number of Employees</label>
                      <select value={demoEmployees} onChange={e=>setDemoEmployees(e.target.value)} className="pp-input" required>
                        <option value="">Select employee count</option>
                        <option value="up-to-25">Up to 25</option>
                        <option value="up-to-50">Up to 50</option>
                        <option value="up-to-100">Up to 100</option>
                        <option value="up-to-200">Up to 200</option>
                        <option value="200+">200+</option>
                      </select>
                    </div>
                    <button type="submit" disabled={demoSubmitting} className="pp-btn-gold" style={{ width:'100%', textAlign:'center', opacity: demoSubmitting ? 0.6 : 1 }}>
                      {demoSubmitting ? 'Requesting...' : 'Request Free Demo →'}
                    </button>
                    {demoError && (
                      <div style={{ fontSize:13, color:'#e74c3c', background:'rgba(192,57,43,0.1)', border:'1px solid rgba(192,57,43,0.3)', borderRadius:8, padding:'10px 14px' }}>
                        {demoError}
                      </div>
                    )}
                  </form>
                ) : (
                  <div style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                    <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(39,174,96,0.12)', border:'1px solid rgba(39,174,96,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#27ae60', fontSize:22 }}>✓</div>
                    <div>
                      <h3 className="pp-syne" style={{ fontSize:18, fontWeight:800, color:'var(--pp-white)' }}>Thank you {demoName || 'there'}!</h3>
                      <p style={{ fontSize:13, color:'var(--pp-white-dim)', marginTop:8 }}>We'll WhatsApp you within 2 hours to schedule your demo.</p>
                    </div>
                    <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" style={{
                      background:'#25D366', color:'#fff', borderRadius:10, padding:'12px 24px',
                      fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13,
                      textDecoration:'none',
                    }}>
                      Chat with us on WhatsApp →
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ══ FOOTER ══ */}
      <footer style={{ background:'#050505', borderTop:'1px solid var(--pp-border)', padding:'48px 24px 24px' }}>
        <div style={{ ...S.maxW, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32, marginBottom:32 }}>
          <div>
            <div className="pp-syne" style={{ fontSize:20, fontWeight:800, color:'var(--pp-white)', letterSpacing:'-0.5px', marginBottom:4 }}>
              Punch<span style={S.gold}>Pay</span>
            </div>
            <div style={{ fontSize:11, color:'var(--pp-gold-dim)', letterSpacing:'1px', marginBottom:8 }}>Punch in. Pay out.</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', lineHeight:1.6 }}>Built for factories and shops across Tamil Nadu.</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:12 }}>© 2025 PunchPay by MZone Technologies</div>
          </div>
          <div>
            <div className="pp-syne" style={{ fontSize:12, fontWeight:700, color:'var(--pp-white-dim)', marginBottom:14, letterSpacing:'1px', textTransform:'uppercase' }}>Product</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[['Features','features'],['How it Works','how-it-works'],['Pricing','pricing'],['Login','login-section']].map(([l,id]) => (
                <button key={id} type="button" className="pp-nav-link" style={{ textAlign:'left', fontSize:12 }} onClick={() => handleScrollToSection(id)}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="pp-syne" style={{ fontSize:12, fontWeight:700, color:'var(--pp-white-dim)', marginBottom:14, letterSpacing:'1px', textTransform:'uppercase' }}>Contact</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:12, color:'var(--pp-white-dim)' }}>
              <div>📱 Anish: +91 98424 81388</div>
              <div>📱 Thanveer: +91 96008 44041</div>
              <div>📧 info@mzonetechnologies.com</div>
              <div>🌐 punchpay.in</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:20, textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.2)' }}>
          Made with ❤️ in Tamil Nadu 🇮🇳 &nbsp;·&nbsp; Punch பண்ணு. Salary பாரு.
        </div>
      </footer>

      {/* ══ FLOATING WHATSAPP ══ */}
      <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="pp-wa-float" title="Chat with us">💬</a>

    </div>
  );
}