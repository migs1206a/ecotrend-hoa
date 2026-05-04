import React, { useState } from 'react';
import './ForgotPassword.css';
import ecohoa from '../../assets/ecohoa.png';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { apiUrl } from '../../utils/api';

const ForgotPasswordPage = ({ onNavigateToLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to send reset email');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError('Connection error. Please try again later.');
      setLoading(false);
    }
  };

  const preventCopyPaste = (e) => {
    e.preventDefault();
  };

  if (success) {
    return (
      <div className="forgot-password-container auth-screen">
        <div className="forgot-password-card">
          <div className="success-content">
            <CheckCircle size={64} className="success-icon" />
            <h2>Check Your Email</h2>
            <p className="success-message">
              If an account exists for that email address, a password reset link has been sent.
            </p>
            <p className="success-submessage">
              Please check your inbox and click the link to reset your password.
              The link will expire in 1 hour.
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

  return (
    <div className="forgot-password-container auth-screen">
      <div className="auth-layout auth-layout--compact">
        <aside className="auth-brand-panel">
          <div className="auth-brand-card">
            <div>
              <span className="auth-brand-kicker">Account Recovery</span>
              <h2 className="auth-brand-title">Reset access without calling the admin desk.</h2>
              <p className="auth-brand-copy">
                We will send a secure reset link to the email address connected to your resident or officer account.
              </p>
            </div>

            <ul className="auth-brand-list">
              <li>Reset links are time-limited for account security.</li>
              <li>Use the same verified email address tied to your account.</li>
              <li>You can return to the login page anytime after sending the request.</li>
            </ul>
          </div>
        </aside>

        <div className="auth-card-shell">
          <div className="forgot-password-card">
            <div className="forgot-password-header">
              <div className="logo-container">
                <img src={ecohoa} alt="EHAI Logo" className="logo-image" />
              </div>
              <h1 className="forgot-password-title">Forgot Password?</h1>
              <p className="forgot-password-subtitle">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="forgot-password-form">
              <div className="form-group">
                <label className="form-label">
                  <Mail size={16} className="label-icon" />
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onPaste={preventCopyPaste}
                  onCopy={preventCopyPaste}
                  onCut={preventCopyPaste}
                  className="form-input"
                  disabled={loading}
                />
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
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <button
                type="button"
                onClick={onNavigateToLogin}
                className="btn-back"
                disabled={loading}
              >
                <ArrowLeft size={18} />
                Back to Login
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

export default ForgotPasswordPage;
