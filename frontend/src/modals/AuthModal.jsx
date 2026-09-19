import { useState } from 'react';
import { User, LogOut } from 'lucide-react';
import { supabase } from '../supabase';
import Modal from '../components/Modal';

export default function AuthModal({ user, startInSignUp = false, onClose, onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(startInSignUp);
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
          setSuccessMsg('Account created. You’re signed in.');
          onAuthSuccess(data.session);
        } else {
          setSuccessMsg('Account created. Check your email to confirm your address, then sign in.');
          setIsSignUp(false); // Back to the sign-in form so they can log in after confirming
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSuccessMsg('Signed in.');
        if (data.session) onAuthSuccess(data.session);
      }
    } catch (err) {
      setErrorMsg(err.message || 'That didn’t work. Please try again.');
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
    <Modal title={user ? 'Your account' : isSignUp ? 'Create an account' : 'Sign in'} icon={User} onClose={onClose}>
      {user ? (
        <>
          <p className="muted">Signed in as <strong>{user.email}</strong></p>
          <button className="btn btn-soft" onClick={handleSignOut}><LogOut size={16} /> Sign out</button>
        </>
      ) : (
        <form onSubmit={handleAuth} className="form">
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" required autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {errorMsg && <p className="form-msg form-error" role="alert">{errorMsg}</p>}
          {successMsg && <p className="form-msg form-ok" role="status">{successMsg}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'One moment…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
          <p className="muted small center">
            {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); setSuccessMsg(''); }}>
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      )}
    </Modal>
  );
}
