import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const apiUrl = path => `${apiBaseUrl}${path}`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Login failed');
    setUser(data.user);
    return data;
  };

  const register = async (email, password, name) => {
    const response = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Registration failed');
    return data;
  };

  const logout = async () => {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const value = { user, loading, login, register, logout, refreshUser: fetchUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading"><i className="bi bi-hourglass-split"/> Loading…</div>;
  if (!user) return <LoginPage />;
  if (requireAdmin && user.role !== 'admin') return <div className="auth-denied"><i className="bi bi-shield-lock"/> Admin access required.</div>;
  return children;
}

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <i className="bi bi-envelope-paper-fill"/>
          <h2>Mazzi Mail</h2>
          <p>Sign in to your account</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
            {submitting ? <i className="bi bi-hourglass-split"/> : <i className="bi bi-box-arrow-in-right"/>} Sign In
          </button>
        </form>
        <div className="auth-footer">
          <p>Don't have an account? <a href="#" onClick={e => { e.preventDefault(); window.location.href = '/signup'; }}>Sign up</a></p>
        </div>
      </div>
    </div>
  );
}