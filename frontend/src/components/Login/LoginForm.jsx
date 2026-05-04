import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './LoginForm.css';
import ecohoa from '../../assets/ecohoa.png';


const LoginForm = ({
  showPassword,
  setShowPassword,
  formData,
  setFormData,
  error,
  loading,
  handleLogin,
  handleKeyPress,
  onNavigateToRegister,
  onNavigateToForgotPassword
}) => {
  // Prevent copy/paste/cut
  const preventCopyPaste = (e) => {
    e.preventDefault();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-container">
            <img src={ecohoa} alt="EHAI Logo" className="logo-image" />
          </div>
          <h1 className="login-title">Ecotrend Homeowners Association</h1>
          <p className="login-subtitle">Welcome back Residents.</p>
        </div>
        
        <div className="login-form">
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              onKeyPress={handleKeyPress}
              onPaste={preventCopyPaste}
              onCopy={preventCopyPaste}
              onCut={preventCopyPaste}
              maxLength={20}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="password-container">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onKeyPress={handleKeyPress}
                onPaste={preventCopyPaste}
                onCopy={preventCopyPaste}
                onCut={preventCopyPaste}
                maxLength={20}
                className="form-input"
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
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Logging in...
              </>
            ) : (
              'Login'
            )}
          </button>

          <div className="forgot-password">
            <button onClick={onNavigateToForgotPassword} className="forgot-password-link">
              Forgot Password?
            </button>
          </div>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="register-link">
            Don't have an account?
            <button onClick={onNavigateToRegister}>
              Create Account
            </button>
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

export default LoginForm;