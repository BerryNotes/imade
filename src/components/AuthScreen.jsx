import React, { useState } from 'react';
import api from '../api';

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/login' : '/api/register';
      const data = await api.post(endpoint, { username: username.trim(), password });
      onAuth(data.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a14',
      padding: 20,
    }}>
      <div style={{
        background: '#14142a',
        border: '1px solid #2a2a45',
        borderRadius: 20,
        padding: '40px 32px',
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: 32,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #e2e8f0, #818cf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>IMAde</h1>
          <p style={{ color: '#6b6b80', fontSize: 14, margin: 0 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#1a0a0a',
            border: '1px solid #5a2a2a',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              autoComplete="username"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#4338ca'}
              onBlur={e => e.target.style.borderColor = '#2a2a45'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#8a8aa0', fontSize: 12, marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#4338ca'}
              onBlur={e => e.target.style.borderColor = '#2a2a45'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            style={{
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
              opacity: (!username.trim() || !password) ? 0.5 : 1,
            }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Toggle mode */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ color: '#6b6b80', fontSize: 13 }}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          {' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#818cf8',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
