import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep a ref that always holds the latest user value.
  // This lets completeOnboarding / restartTour read current user
  // without being in their dependency arrays, avoiding stale closures.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Restore session ──────────────────────────────────────────────────────
  useEffect(() => {
    const token     = localStorage.getItem('ff_token');
    const savedUser = localStorage.getItem('ff_user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        userRef.current = parsed;
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch {
        localStorage.removeItem('ff_token');
        localStorage.removeItem('ff_user');
      }
    }
    setLoading(false);
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('ff_token', data.token);
    localStorage.setItem('ff_user', JSON.stringify(data.user));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    userRef.current = data.user;
    return data.user;
  }, []);

  // ── Signup ───────────────────────────────────────────────────────────────
  const signup = useCallback(async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    localStorage.setItem('ff_token', data.token);
    localStorage.setItem('ff_user', JSON.stringify(data.user));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    userRef.current = data.user;
    return data.user;
  }, []);

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    userRef.current = null;
  }, []);

  // ── Complete onboarding ─────────────────────────────────────────────────
  // FIX: reads from userRef (always fresh) to avoid stale closure.
  // The API call is fire-and-forget; state updates regardless of outcome
  // so the overlay never gets stuck due to a failed network call.
  const completeOnboarding = useCallback(() => {
    const current = userRef.current;
    if (!current) return;

    // Update local state immediately — do NOT wait for API response
    const updated = { ...current, isFirstLogin: false };
    setUser(updated);
    userRef.current = updated;
    localStorage.setItem('ff_user', JSON.stringify(updated));

    // Best-effort server sync — failure is silent and non-blocking
    api.post('/auth/onboarding/complete').catch(err => {
      console.warn('[onboarding] Could not sync with server:', err.message);
    });
  }, []); // stable — no deps needed because we use userRef

  // ── Restart tour ────────────────────────────────────────────────────────
  const restartTour = useCallback(() => {
    const current = userRef.current;
    if (!current) return;

    const updated = { ...current, isFirstLogin: true };
    setUser(updated);
    userRef.current = updated;
    localStorage.setItem('ff_user', JSON.stringify(updated));

    api.post('/auth/onboarding/restart').catch(err => {
      console.warn('[onboarding] Could not sync restart with server:', err.message);
    });
  }, []); // stable — no deps needed

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, completeOnboarding, restartTour }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
