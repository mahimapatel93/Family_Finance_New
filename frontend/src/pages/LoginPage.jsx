import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'demo@familyfinance.in', password: 'password123' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-sky-950 to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #0ea5e9 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 40%)',
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xl">F</div>
            <span className="font-bold text-xl text-white">FamilyFinance</span>
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Smart money management<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">for your family</span>
          </h1>
          <p className="text-slate-400 text-lg">Track expenses, manage bills, grow investments — all powered by AI insights.</p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[['AI Insights', '🧠'], ['Bill Alerts', '🔔'], ['Gold Prices', '🥇']].map(([label, icon]) => (
              <div key={label} className="glass rounded-xl p-4 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-slate-600 text-xs">© 2025 FamilyFinance. All rights reserved.</div>
      </div>

      {/* Right login form */}
      <div className="flex-1 lg:max-w-md flex items-center justify-center p-8 bg-surface-950">
        <div className="w-full max-w-sm space-y-7 animate-fade-in">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold">F</div>
            <span className="font-bold text-white">FamilyFinance</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your family account</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email" required autoComplete="email"
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="form-input" placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="form-input pr-11" placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div className="text-center">
            <p className="text-slate-500 text-sm">
              No account?{' '}
              <Link to="/signup" className="text-sky-400 hover:text-sky-300 font-medium">Create one</Link>
            </p>
          </div>

          <div className="glass rounded-xl p-4 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-400">Demo Credentials</p>
            <p>Email: demo@familyfinance.in</p>
            <p>Password: password123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
