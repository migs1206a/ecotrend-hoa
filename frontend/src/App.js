import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import LoginPage from './components/Login/LoginPage';
import RegisterPage from './components/Register/RegisterPage';
import ForgotPasswordPage from './components/ForgotPassword/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPassword/ResetPasswordPage';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import GuardDashboard from './components/Dashboard/GuardDashboard';
import Dashboard from './components/Dashboard/Dashboard';
import ResidentDashboard from './components/Dashboard/ResidentDashboard';
import { blockClipboardForEditableFields } from './utils/formSecurity';

/* ─────────────────────────────────────────────────────────────────
   GLOBAL MODAL STYLES
   Injected once so every dashboard shares the same look.
───────────────────────────────────────────────────────────────── */
const MODAL_STYLES = `
  .app-modal-overlay {
    position: fixed; inset: 0;
    background: rgba(12,18,15,0.58); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999; padding: 1.5rem;
    animation: appFadeIn 0.2s ease;
  }
  @keyframes appFadeIn  { from { opacity: 0; }              to { opacity: 1; } }
  @keyframes appSlideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

  .app-modal {
    background: rgba(255,255,255,0.95); border-radius: 30px;
    border: 1px solid rgba(255,255,255,0.7);
    padding: 2.4rem 2rem; width: 100%; max-width: 440px;
    text-align: center; display: flex; flex-direction: column;
    align-items: center; gap: 1rem;
    box-shadow: 0 28px 80px rgba(12,18,15,0.24);
    backdrop-filter: blur(22px);
    animation: appSlideUp 0.3s cubic-bezier(0.4,0,0.2,1);
  }
  .app-modal-icon {
    width: 4.4rem; height: 4.4rem; border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
  }
  .app-modal-title {
    font-size: 1.35rem; font-weight: 800;
    color: #111827; margin: 0;
    font-family: 'Plus Jakarta Sans', sans-serif;
    letter-spacing: -0.03em;
  }
  .app-modal-message {
    font-size: 0.95rem; color: #445049;
    font-weight: 500; margin: 0; line-height: 1.7;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .app-modal-actions {
    display: flex; gap: 1rem; width: 100%; margin-top: 0.5rem;
  }
  .app-modal-btn {
    flex: 1; padding: 0.9rem 1.5rem; border: none;
    border-radius: 18px; font-size: 0.9375rem; font-weight: 700;
    cursor: pointer; transition: all 0.2s ease;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .app-modal-btn-cancel {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    color: #ef4444;
  }
  .app-modal-btn-cancel:hover { background: #ef4444; color: #fff; transform: translateY(-2px); }
  .app-modal-btn-confirm {
    background: linear-gradient(135deg, #10b981, #14b8a6);
    color: #fff; box-shadow: 0 4px 12px rgba(16,185,129,0.3);
  }
  .app-modal-btn-confirm:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(16,185,129,0.4); }
  .app-modal-btn-ok {
    background: linear-gradient(135deg, #10b981, #14b8a6);
    color: #fff; box-shadow: 0 4px 12px rgba(16,185,129,0.3);
  }
  .app-modal-btn-ok:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(16,185,129,0.4); }
`;

/* ─────────────────────────────────────────────────────────────────
   INLINE SVG ICONS (no lucide dependency at App level)
───────────────────────────────────────────────────────────────── */
const IconWarn  = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const IconCheck = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconError = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const IconInfo  = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;

const extractResetTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const queryToken = urlParams.get('token');

  if (queryToken) {
    return queryToken;
  }

  const pathMatch = window.location.pathname.match(/\/reset-password\/([^/]+)/);
  return pathMatch ? decodeURIComponent(pathMatch[1]) : null;
};

const clearResetLocation = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  url.pathname = url.pathname.replace(/\/reset-password\/[^/]+\/?$/, '/');
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const getJwtExpiryMs = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payload = JSON.parse(atob(parts[1]));
    const expSeconds = Number(payload?.exp);
    if (!Number.isFinite(expSeconds)) {
      return null;
    }
    return expSeconds * 1000;
  } catch (error) {
    return null;
  }
};

/* ─────────────────────────────────────────────────────────────────
   APP
───────────────────────────────────────────────────────────────── */
const App = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [userRole, setUserRole]       = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLoginRedirect, setShowLoginRedirect] = useState(false);
  const [resetToken, setResetToken]   = useState(null);
  const loginRedirectTimerRef = useRef(null);
  const idleTimerRef = useRef(null);

  // ── Global Modal State ─────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });
  const [alertModal,   setAlertModal]   = useState({ open: false, message: '', type: 'info' });

  // ── Modal Helpers (passed as props to every dashboard) ─────────
  const showConfirm = (message, onConfirm) => setConfirmModal({ open: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal({ open: false, message: '', onConfirm: null });

  const showAlert = (message, type = 'info') => setAlertModal({ open: true, message, type });
  const closeAlert = () => setAlertModal({ open: false, message: '', type: 'info' });
  const performLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    setUserRole(null);
    setCurrentPage('login');
  }, []);

  // ── Inject global styles once ──────────────────────────────────
  useEffect(() => {
    const tag = document.createElement('style');
    tag.id = 'app-modal-styles';
    if (!document.getElementById('app-modal-styles')) {
      tag.textContent = MODAL_STYLES;
      document.head.appendChild(tag);
    }
  }, []);

  useEffect(() => () => {
    if (loginRedirectTimerRef.current) {
      clearTimeout(loginRedirectTimerRef.current);
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const blockClipboard = (event) => blockClipboardForEditableFields(event);

    document.addEventListener('copy', blockClipboard, true);
    document.addEventListener('cut', blockClipboard, true);
    document.addEventListener('paste', blockClipboard, true);

    return () => {
      document.removeEventListener('copy', blockClipboard, true);
      document.removeEventListener('cut', blockClipboard, true);
      document.removeEventListener('paste', blockClipboard, true);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role  = localStorage.getItem('role');
    const tokenExpiryMs = getJwtExpiryMs(token);
    const isExpired = Number.isFinite(tokenExpiryMs) && tokenExpiryMs <= Date.now();
    if (token && role && !isExpired) { setUserRole(role); setCurrentPage('dashboard'); }
    if (isExpired) { performLogout(); }
    const tokenFromUrl = extractResetTokenFromLocation();
    if (tokenFromUrl) { setResetToken(tokenFromUrl); setCurrentPage('reset-password'); }
  }, [performLogout]);

  const handleLoginSuccess = (role) => {
    setShowLoginRedirect(true);
    loginRedirectTimerRef.current = setTimeout(() => {
      setUserRole(role);
      setCurrentPage('dashboard');
      setShowLoginRedirect(false);
    }, 1100);
  };

  const handleRegisterSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => { setShowSuccess(false); setCurrentPage('login'); }, 3000);
  };

  // ── Logout — uses custom confirm modal ─────────────────────────
  const handleLogout = () => {
    performLogout();
  };

  useEffect(() => {
    if (currentPage !== 'dashboard' || !userRole) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      return undefined;
    }

    const timeoutFromEnv = Number(process.env.REACT_APP_IDLE_TIMEOUT_MINUTES || 45);
    const idleTimeoutMinutes = Math.min(60, Math.max(30, Number.isFinite(timeoutFromEnv) ? timeoutFromEnv : 45));
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        performLogout();
      }, idleTimeoutMs);
    };

    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleTimer, true));
    resetIdleTimer();

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimer, true));
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [currentPage, userRole, performLogout]);

  const navigateToRegister       = () => setCurrentPage('register');
  const navigateToLogin          = () => { clearResetLocation(); setResetToken(null); setCurrentPage('login'); };
  const navigateToForgotPassword = () => { clearResetLocation(); setCurrentPage('forgot-password'); };

  // ── Confirm Modal Component ────────────────────────────────────
  const ConfirmModalUI = () => (
    <div className="app-modal-overlay" onClick={closeConfirm}>
      <div className="app-modal" onClick={e => e.stopPropagation()}>
        <div className="app-modal-icon" style={{ background: '#fef3c7' }}><IconWarn /></div>
        <h3 className="app-modal-title">Confirm Action</h3>
        <p className="app-modal-message">{confirmModal.message}</p>
        <div className="app-modal-actions">
          <button className="app-modal-btn app-modal-btn-cancel"  onClick={closeConfirm}>Cancel</button>
          <button className="app-modal-btn app-modal-btn-confirm" onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}>Confirm</button>
        </div>
      </div>
    </div>
  );

  // ── Alert Modal Component ──────────────────────────────────────
  const AlertModalUI = () => {
    const { type, message } = alertModal;
    const isSuccess = type === 'success';
    const isError   = type === 'error';
    const iconBg    = isSuccess ? '#ecfdf5' : isError ? '#fee2e2' : '#dbeafe';
    return (
      <div className="app-modal-overlay" onClick={closeAlert}>
        <div className="app-modal" onClick={e => e.stopPropagation()}>
          <div className="app-modal-icon" style={{ background: iconBg }}>
            {isSuccess ? <IconCheck /> : isError ? <IconError /> : <IconInfo />}
          </div>
          <h3 className="app-modal-title">
            {isSuccess ? 'Success' : isError ? 'Error' : 'Notice'}
          </h3>
          <p className="app-modal-message">{message}</p>
          <div className="app-modal-actions">
            <button className="app-modal-btn app-modal-btn-ok" onClick={closeAlert}>OK</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Success screen after registration ─────────────────────────
  if (showSuccess) {
    return (
      <div className="app-success-screen">
        <div className="app-success-card">
          <div className="app-success-icon-wrap">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="app-success-title">Registration Successful</h2>
          <p className="app-success-copy">
            Your account is now pending approval from the admin side. Once it is reviewed,
            you can sign in and start using the resident portal.
          </p>
          <div className="app-success-meta">Redirecting back to login shortly</div>
        </div>
      </div>
    );
  }

  if (showLoginRedirect) {
    return (
      <div className="app-login-redirect-screen">
        <div className="app-login-redirect-card">
          <div className="app-login-redirect-ring">
            <div className="app-login-redirect-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7L10 17l-5-5" />
              </svg>
            </div>
          </div>
          <h2 className="app-login-redirect-title">Login Successful</h2>
          <p className="app-login-redirect-copy">Preparing your dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Dashboard routing ─────────────────────────────────────────
  if (currentPage === 'dashboard' && userRole) {
    const normalizedRole = userRole.toUpperCase();
    // shared props passed to every dashboard
    const modalProps = { showConfirm, showAlert };

    switch (normalizedRole) {
      case 'MASTER_ADMIN': return <><AdminDashboard       onLogout={handleLogout} {...modalProps} />{confirmModal.open && <ConfirmModalUI />}{alertModal.open && <AlertModalUI />}</>;
      case 'ADMIN':        return <><AdminDashboard       onLogout={handleLogout} {...modalProps} />{confirmModal.open && <ConfirmModalUI />}{alertModal.open && <AlertModalUI />}</>;
      case 'GUARD':        return <><GuardDashboard       onLogout={handleLogout} {...modalProps} />{confirmModal.open && <ConfirmModalUI />}{alertModal.open && <AlertModalUI />}</>;
      case 'RESIDENT':     return <><ResidentDashboard    onLogout={handleLogout} {...modalProps} role="Resident" />{confirmModal.open && <ConfirmModalUI />}{alertModal.open && <AlertModalUI />}</>;
      default:             return <><Dashboard            onLogout={handleLogout} {...modalProps} role="User"     />{confirmModal.open && <ConfirmModalUI />}{alertModal.open && <AlertModalUI />}</>;
    }
  }

  if (currentPage === 'forgot-password') return <ForgotPasswordPage onNavigateToLogin={navigateToLogin} />;
  if (currentPage === 'reset-password')  return <ResetPasswordPage  token={resetToken} onNavigateToLogin={navigateToLogin} />;
  if (currentPage === 'register')        return <RegisterPage onRegisterSuccess={handleRegisterSuccess} onNavigateToLogin={navigateToLogin} />;

  return <LoginPage onLoginSuccess={handleLoginSuccess} onNavigateToRegister={navigateToRegister} onNavigateToForgotPassword={navigateToForgotPassword} />;
};

export default App;
