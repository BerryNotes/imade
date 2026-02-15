import React, { useState, useEffect } from 'react';
import api from '../api';

function AuthScreen({ onAuth, resetToken, verifiedMessage }) {
  // Modes: 'login', 'register', 'forgot', 'reset', 'check-email', 'verification-needed'
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(verifiedMessage || '');
  const [resendEmail, setResendEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError(''); setLoading(true); setSuccessMessage('');
    try {
      const data = await api.login(username.trim(), password);
      onAuth(data.user);
    } catch (err) {
      if (err.needsVerification) {
        setResendEmail(err.email || '');
        setMode('verification-needed');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError(''); setLoading(true); setSuccessMessage('');
    try {
      const data = await api.register(username.trim(), password, email.trim() || undefined);
      if (data.needsVerification) {
        setResendEmail(email.trim());
        setMode('check-email');
      } else if (data.user) {
        onAuth(data.user);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(''); setLoading(true);
    try {
      const data = await api.forgotPassword(email.trim());
      setSuccessMessage(data.message || 'Check your email for a reset link.');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      await api.resetPassword(resetToken, password);
      setSuccessMessage('Password reset successfully. You can now sign in.');
      setMode('login');
      setPassword(''); setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !resendEmail) return;
    try {
      await api.resendVerification(resendEmail);
      setResendCooldown(60);
      setSuccessMessage('Verification email sent!');
    } catch (err) {
      setError(err.message || 'Failed to resend');
    }
  };

  const inputStyle = {
    width: '100%',
    background: '#0d0d1a',
    border: '1px solid #2a2a45',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const btnStyle = {
    width: '100%',
    padding: 13,
    borderRadius: 12,
    background: loading ? '#2a2a45' : 'linear-gradient(135deg, #4338ca, #6366f1)',
    border: 'none',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: loading ? 'default' : 'pointer',
    boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.3)',
    transition: 'all 0.2s',
  };

  const linkStyle = {
    background: 'none',
    border: 'none',
    color: '#818cf8',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  };

  const renderHeader = (subtitle) => (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <h1 style={{
        margin: '0 0 8px', fontSize: 32, fontWeight: 700,
        background: 'linear-gradient(135deg, #e2e8f0, #818cf8)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.02em',
      }}>IMAde</h1>
      <p style={{ color: '#6b6b80', fontSize: 14, margin: 0 }}>{subtitle}</p>
    </div>
  );

  const renderError = () => error && (
    <div style={{
      background: '#1a0a0a', border: '1px solid #5a2a2a', borderRadius: 10,
      padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 16,
    }}>{error}</div>
  );

  const renderSuccess = () => successMessage && (
    <div style={{
      background: '#0a1a0a', border: '1px solid #2a5a2a', borderRadius: 10,
      padding: '10px 14px', color: '#22c55e', fontSize: 13, marginBottom: 16,
    }}>{successMessage}</div>
  );

  const renderInput = (type, value, onChange, placeholder, autoComplete, autoFocus) => (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} autoFocus={autoFocus}
      autoComplete={autoComplete} style={inputStyle}
      onFocus={e => e.target.style.borderColor = '#4338ca'}
      onBlur={e => e.target.style.borderColor = '#2a2a45'}
    />
  );

  const renderContent = () => {
    // Check email after registration
    if (mode === 'check-email') return (
      <>
        {renderHeader('Check your email')}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9993;</div>
          <p style={{ color: '#c0c0d0', fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
            We sent a verification link to
          </p>
          <p style={{ color: '#818cf8', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>{resendEmail}</p>
          <p style={{ color: '#6b6b80', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
            Click the link in the email to verify your account, then come back here to sign in.
          </p>
          {renderSuccess()}
          <button onClick={handleResend} disabled={resendCooldown > 0}
            style={{ ...linkStyle, fontSize: 14, opacity: resendCooldown > 0 ? 0.5 : 1 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} style={linkStyle}>
            Back to sign in
          </button>
        </div>
      </>
    );

    // Verification needed (login blocked)
    if (mode === 'verification-needed') return (
      <>
        {renderHeader('Verify your email')}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9993;</div>
          <p style={{ color: '#c0c0d0', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            Your account needs email verification before you can sign in.
            {resendEmail && <> Check <span style={{ color: '#818cf8' }}>{resendEmail}</span> for the verification link.</>}
          </p>
          {renderSuccess()}
          {renderError()}
          {resendEmail && (
            <button onClick={handleResend} disabled={resendCooldown > 0}
              style={{ ...linkStyle, fontSize: 14, opacity: resendCooldown > 0 ? 0.5 : 1, marginBottom: 8 }}>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
            </button>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} style={linkStyle}>
            Back to sign in
          </button>
        </div>
      </>
    );

    // Forgot password
    if (mode === 'forgot') return (
      <>
        {renderHeader('Reset your password')}
        {renderError()}
        {renderSuccess()}
        {!successMessage ? (
          <form onSubmit={handleForgot}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Email</label>
              {renderInput('email', email, setEmail, 'Enter your email', 'email', true)}
            </div>
            <button type="submit" disabled={loading || !email.trim()} style={{ ...btnStyle, opacity: !email.trim() ? 0.5 : 1 }}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        ) : null}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} style={linkStyle}>
            Back to sign in
          </button>
        </div>
      </>
    );

    // Reset password (with token)
    if (mode === 'reset') return (
      <>
        {renderHeader('Choose a new password')}
        {renderError()}
        {renderSuccess()}
        <form onSubmit={handleReset}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>New Password</label>
            {renderInput('password', password, setPassword, 'Enter new password', 'new-password', true)}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Confirm Password</label>
            {renderInput('password', confirmPassword, setConfirmPassword, 'Confirm new password', 'new-password')}
          </div>
          <button type="submit" disabled={loading || !password || !confirmPassword}
            style={{ ...btnStyle, opacity: (!password || !confirmPassword) ? 0.5 : 1 }}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </>
    );

    // Login
    if (mode === 'login') return (
      <>
        {renderHeader('Sign in to your account')}
        {renderError()}
        {renderSuccess()}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Username</label>
            {renderInput('text', username, setUsername, 'Enter username', 'username', true)}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Password</label>
            {renderInput('password', password, setPassword, 'Enter password', 'current-password')}
          </div>
          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); }}
              style={{ ...linkStyle, fontSize: 12, color: '#6b6b80' }}>
              Forgot password?
            </button>
          </div>
          <button type="submit" disabled={loading || !username.trim() || !password}
            style={{ ...btnStyle, opacity: (!username.trim() || !password) ? 0.5 : 1 }}>
            {loading ? 'Please wait...' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ color: '#6b6b80', fontSize: 13 }}>Don't have an account?</span>{' '}
          <button onClick={() => { setMode('register'); setError(''); setSuccessMessage(''); }} style={linkStyle}>
            Create one
          </button>
        </div>
      </>
    );

    // Register
    return (
      <>
        {renderHeader('Create a new account')}
        {renderError()}
        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Username</label>
            {renderInput('text', username, setUsername, 'Enter username', 'username', true)}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Email</label>
            {renderInput('email', email, setEmail, 'Enter email', 'email')}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Password</label>
            {renderInput('password', password, setPassword, 'Enter password', 'new-password')}
          </div>
          <button type="submit" disabled={loading || !username.trim() || !password}
            style={{ ...btnStyle, opacity: (!username.trim() || !password) ? 0.5 : 1 }}>
            {loading ? 'Please wait...' : 'Create Account'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ color: '#6b6b80', fontSize: 13 }}>Already have an account?</span>{' '}
          <button onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} style={linkStyle}>
            Sign in
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a14', padding: 20,
    }}>
      <div style={{
        background: '#14142a', border: '1px solid #2a2a45', borderRadius: 20,
        padding: '40px 32px', maxWidth: 400, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {renderContent()}
      </div>
    </div>
  );
}

export default AuthScreen;
