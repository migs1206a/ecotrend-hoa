import React, { useState } from 'react';
import LoginForm from './LoginForm';
import { apiUrl } from '../../utils/api';

const LoginPage = ({ onLoginSuccess, onNavigateToRegister, onNavigateToForgotPassword }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Login failed');
        setLoading(false);
        return;
      }

      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('user', JSON.stringify(data.user));

      onLoginSuccess(data.role);
    } catch (err) {
      setError('Connection error. Please check if the server is running.');
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <LoginForm
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      formData={formData}
      setFormData={setFormData}
      error={error}
      loading={loading}
      handleLogin={handleLogin}
      handleKeyPress={handleKeyPress}
      onNavigateToRegister={onNavigateToRegister}
      onNavigateToForgotPassword={onNavigateToForgotPassword}
    />
  );
};

export default LoginPage;
