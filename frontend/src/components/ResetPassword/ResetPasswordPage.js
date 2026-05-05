import React, { useState, useEffect, useCallback } from 'react';
import './ResetPassword.css';
import ecohoa from '../../assets/ecohoa.png';
import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { apiUrl } from '../../utils/api';

const ResetPasswordPage = ({ token, onNavigateToLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validToken, setValidToken] = useState(null);

  const verifyToken = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`/auth/verify-reset-token/${token}`));
      const data = await response.json();

      if (response.ok) {
        setValidToken(true);
      } else {
        setValidToken(false);
        setError(data.message || 'Invalid or expired reset link');
      }
    } catch (err) {
      setValidToken(false);
      setError('Connection error. Please try again later.');
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setValidToken(false);
      setError('No reset token provided');
    }
  }, [token, verifyToken]);

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      setTimeout(() => {
        onNavigateToLogin();
      }, 3000);
    } catch (err) {
      setError('Connection error. Please try again later.');
      setLoading(false);
    }
  };

  const preventCopyPaste = (e) => {
    e.preventDefault();
  };

  if (validToken === null) {
    return (
      <div className="reset-password-container auth-screen">
        <div className="reset-password-card">
          <div className="loading-content">
            <span className="spinner-large"></span>
            <p>Verifying reset link...</p>
          </div>
        </div>
        <div className="background-decoration">
          <div className="leaf-pattern leaf-1"></div>
          <div className="leaf-pattern leaf-2"></div>
          <div className="leaf-pattern leaf-3"></div>
        </div>
      </div>
    );
  }

  if (validToken === false) {
    return (
      <div className="reset-password-container auth-screen">
        <div className="reset-password-card">
          <div className="error-content">
            <XCircle size={64} className="error-icon-large" />
            <h2>Invalid Reset Link</h2>
            <p className="error-message-large">
              {error || 'This password reset link is invalid or has expired.'}
            </p>
            <p className="error-submessage">
              Please request a new password reset link.
            </p>
            <button
              onClick={onNavigateToLogin}
              className="btn-back-to-login"
            >
              Back to Login
            </button>
          </div>
        </div>
        <div className="background-decoration">
          <div className="leaf-pattern leaf-1"></div>
          <div className="leaf-pattern leaf-2"></div>
          <div className="leaf-pattern leaf-3"></div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="reset-password-container auth-screen">
        <div className="reset-password-card">
          <div className="success-content">
            <CheckCircle size={64} className="success-icon" />
            <h2>Password Reset Successful!</h2>
            <p className="success-message">
              Your password has been successfully reset.
            </p>
            <p className="success-submessage">
              Redirecting to login page...
            </p>
            <button
              onClick={onNavigateToLogin}
              className="btn-back-to-login"
            >
              Go to Login Now
            </button>
          </div>
        </div>
        <div className="background-decoration">
          <div className="leaf-pattern leaf-1"></div>
          <div className="leaf-pattern leaf-2"></div>
          <div className="leaf-pattern leaf-3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-password-container auth-screen">
      <div className="auth-layout auth-layout--compact">
        <aside className="auth-brand-panel">
          <div className="auth-brand-card">
            <div>
              <span className="auth-brand-kicker">Password Security</span>
              <h2 className="auth-brand-title">Create a stronger password and get back in safely.</h2>
              <p className="auth-brand-copy">
                Use a fresh password that is hard to guess and easy for you to remember.
              </p>
            </div>

            <ul className="auth-brand-list">
              <li>Use at least 8 characters with uppercase, lowercase, numbers, and symbols.</li>
              <li>Avoid reusing passwords from personal email or social accounts.</li>
              <li>Finish the reset here, then sign in again with the new password.</li>
            </ul>
          </div>
        </aside>

        <div className="auth-card-shell">
          <div className="reset-password-card">
            <div className="reset-password-header">
              <div className="logo-container">
                <img src={ecohoa} alt="EHAI Logo" className="logo-image" />
              </div>
              <h1 className="reset-password-title">Reset Password</h1>
              <p className="reset-password-subtitle">
                Enter your new password below.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="reset-password-form">
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="password-container">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a new password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    onPaste={preventCopyPaste}
                    onCopy={preventCopyPaste}
                    onCut={preventCopyPaste}
                    className="form-input"
                    maxLength={20}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <span className="input-hint">Must include: A-Z, a-z, 0-9, and special character</span>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <div className="password-container">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your new password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    onPaste={preventCopyPaste}
                    onCopy={preventCopyPaste}
                    onCut={preventCopyPaste}
                    className="form-input"
                    maxLength={20}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="password-toggle"
                    aria-label="Toggle password visibility"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <span className="error-icon">âš </span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Resetting Password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="background-decoration">
        <div className="leaf-pattern leaf-1"></div>
        <div className="leaf-pattern leaf-2"></div>
        <div className="leaf-pattern leaf-3"></div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
