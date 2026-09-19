import React, { useState } from 'react';
import { supabase } from './supabase';
import { User, LogIn, UserPlus, LogOut, X } from 'lucide-react';

export default function AuthModal({ user, onClose, onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.session) {
          setSuccessMsg('Account created successfully! You are logged in.');
          onAuthSuccess(data.session);
        } else {
          setSuccessMsg('✉️ Account created! Please check your email inbox to confirm your address before logging in.');
          setIsSignUp(false); // Switch to login view so they can sign in after confirming
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSuccessMsg('Logged in successfully!');
        if (data.session) {
          onAuthSuccess(data.session);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onAuthSuccess(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} className="text-indigo-400" />
            {user ? 'Account Settings' : (isSignUp ? 'Create Cue Account' : 'Log In to Cue')}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>

        {user ? (
          <div style={{ padding: '12px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-normal)', marginBottom: '16px' }}>
              Signed in as: <strong style={{ color: '#818cf8' }}>{user.email}</strong>
            </p>
            <button className="btn btn-secondary" style={{ width: '100%', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} onClick={handleSignOut}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuth}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="input-label">Email Address</label>
              <input
                type="email"
                required
                className="input-field"
                placeholder="dev@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="input-label">Password</label>
              <input
                type="password"
                required
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {errorMsg && (
              <div style={{ fontSize: '13px', color: '#f87171', marginBottom: '12px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div style={{ fontSize: '13px', color: '#34d399', marginBottom: '12px', background: 'rgba(52, 211, 153, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                ✓ {successMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
              {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-dim)' }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); setSuccessMsg(''); }}
              >
                {isSignUp ? 'Log In' : 'Sign Up'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
