import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Plus, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';

const RELATIONS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Other'];
const BUDGET_PRESETS = [
  { label: '₹25,000', value: 25000 },
  { label: '₹50,000', value: 50000 },
  { label: '₹75,000', value: 75000 },
  { label: '₹1,00,000', value: 100000 },
];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate   = useNavigate();
  const [step, setStep]       = useState(1);   // 1 = account, 2 = family setup
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Step 1 fields
  const [account, setAccount] = useState({ name: '', email: '', password: '', familyName: '' });

  // Step 2 fields
  const [monthlyBudget, setMonthlyBudget] = useState(50000);
  const [customBudget,  setCustomBudget]  = useState('');
  const [members, setMembers] = useState([{ name: '', relation: 'Spouse' }]);

  const setAcc = (field) => (e) => setAccount(p => ({ ...p, [field]: e.target.value }));

  // ── Step 1 validation ────────────────────────────────────────────────────
  const handleStep1 = (e) => {
    e.preventDefault();
    if (account.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setStep(2);
  };

  // ── Member helpers ────────────────────────────────────────────────────────
  const addMember = () => setMembers(p => [...p, { name: '', relation: 'Child' }]);
  const removeMember = (i) => setMembers(p => p.filter((_, idx) => idx !== i));
  const setMember = (i, field, val) =>
    setMembers(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // ── Final submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const budget = customBudget ? parseFloat(customBudget) : monthlyBudget;
      await signup({
        name:          account.name,
        email:         account.email,
        password:      account.password,
        familyName:    account.familyName,
        monthlyBudget: budget,
        familyMembers: members.filter(m => m.name.trim()),
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-sky-950 to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #0ea5e9 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 40%)',
        }} />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xl">F</div>
          <span className="font-bold text-xl text-white">FamilyFinance</span>
        </div>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Set up your<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">family finances</span>
          </h1>
          <p className="text-slate-400">Takes 2 minutes. No credit card required.</p>
          <div className="space-y-3 pt-4">
            {['Track expenses by category', 'Get AI-powered insights', 'Monitor investments & bills', 'Live gold & silver prices'].map(f => (
              <div key={f} className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-sky-400" />
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-slate-600 text-xs">© 2025 FamilyFinance.</div>
      </div>

      {/* Right form */}
      <div className="flex-1 lg:max-w-lg flex items-center justify-center p-8 bg-surface-950 overflow-y-auto">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">

          {/* Step indicator */}
          <div className="flex items-center gap-3">
            {[1, 2].map(n => (
              <React.Fragment key={n}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  step >= n ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>{n}</div>
                {n < 2 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-sky-500' : 'bg-slate-700'}`} />}
              </React.Fragment>
            ))}
            <span className="text-xs text-slate-500 ml-1">Step {step} of 2</span>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          {/* ── STEP 1: Account details ─────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Create your account</h2>
                <p className="text-slate-400 text-sm mt-1">Basic information to get started</p>
              </div>
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-300">Your Name *</label>
                    <input type="text" required value={account.name} onChange={setAcc('name')} className="form-input" placeholder="Rahul Sharma" />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-300">Family Name</label>
                    <input type="text" value={account.familyName} onChange={setAcc('familyName')} className="form-input" placeholder="Sharma Family" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Email *</label>
                  <input type="email" required value={account.email} onChange={setAcc('email')} className="form-input" placeholder="rahul@example.com" />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Password *</label>
                  <input type="password" required value={account.password} onChange={setAcc('password')} className="form-input" placeholder="At least 6 characters" />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                Next <ChevronRight size={16} />
              </button>
              <p className="text-center text-slate-500 text-sm">
                Already have an account? <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium">Sign in</Link>
              </p>
            </form>
          )}

          {/* ── STEP 2: Family setup ───────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white">Set up your family</h2>
                <p className="text-slate-400 text-sm mt-1">Personalise your budget and add family members</p>
              </div>

              {/* Monthly Budget */}
              <div className="glass rounded-2xl p-5 space-y-3">
                <label className="block text-sm font-semibold text-slate-200">Monthly Budget</label>
                <div className="grid grid-cols-2 gap-2">
                  {BUDGET_PRESETS.map(p => (
                    <button
                      key={p.value} type="button"
                      onClick={() => { setMonthlyBudget(p.value); setCustomBudget(''); }}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        monthlyBudget === p.value && !customBudget
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                      }`}
                    >{p.label}</button>
                  ))}
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-400">Or enter custom amount (₹)</label>
                  <input
                    type="number" min="1000" value={customBudget}
                    onChange={e => { setCustomBudget(e.target.value); setMonthlyBudget(0); }}
                    className="form-input text-sm" placeholder="e.g. 65000"
                  />
                </div>
              </div>

              {/* Family Members */}
              <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-200">Family Members</label>
                  <button type="button" onClick={addMember} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                    <Plus size={13} /> Add
                  </button>
                </div>
                <p className="text-xs text-slate-500">Add people in your household (optional — can do later)</p>
                {members.map((m, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text" value={m.name}
                      onChange={e => setMember(i, 'name', e.target.value)}
                      className="form-input flex-1 text-sm" placeholder="Name"
                    />
                    <select
                      value={m.relation}
                      onChange={e => setMember(i, 'relation', e.target.value)}
                      className="form-input w-32 text-sm"
                    >
                      {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {members.length > 1 && (
                      <button type="button" onClick={() => removeMember(i)} className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary flex items-center gap-1.5">
                  <ChevronLeft size={15} /> Back
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
