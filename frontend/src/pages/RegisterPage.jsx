import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setToken: setAuthToken } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: { name: companyName.trim() },
          admin: {
            name: adminName.trim(),
            email: email.trim(),
            password,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Registration failed');
        return;
      }
      // New companies are created as "pending" — you approve after payment, then they can log in
      if (json.data?.pending) {
        setSuccess(
          'Registration received. Your account will be activated after payment verification. We\'ll notify you at ' +
            (email || 'your email') +
            ' when it\'s ready. You can then sign in from the login page.'
        );
        setCompanyName('');
        setAdminName('');
        setEmail('');
        setPassword('');
        return;
      }
      const token = json.data?.token;
      const userData = json.data?.user;
      if (token) {
        setAuthToken(token, userData ? { user_id: userData.id, company_id: userData.company_id, email: userData.email, role: userData.role } : null);
        navigate('/dashboard', { replace: true });
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-2xl bg-primary-500 flex items-center justify-center text-white font-semibold">
            A
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Attendance SaaS</h1>
            <p className="text-xs text-slate-500">Create your company</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {success}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Acme Inc"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Jane Doe"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="admin@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
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
            {loading ? 'Creating…' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have a company?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
