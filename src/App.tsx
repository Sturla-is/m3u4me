import React, { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import LockScreen from './components/LockScreen';
import SettingsPage from './components/SettingsPage';
import { useStore } from './store';
import { api, getSessionToken, clearSessionToken } from './apiClient';

function AppContent() {
  const { isDarkMode, isAmoledMode, showSettings } = useStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    if (isAmoledMode) {
      document.documentElement.classList.add('amoled');
    } else {
      document.documentElement.classList.remove('amoled');
    }
  }, [isDarkMode, isAmoledMode]);

  // Check auth status on mount
  useEffect(() => {
    api.getAuthStatus().then((res: any) => {
      if (res.enabled && !getSessionToken()) {
        setLocked(true);
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);

  // Listen for auth-expired events (401 from API)
  useEffect(() => {
    const handler = () => setLocked(true);
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  if (!authChecked) return null; // Brief flash prevention

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />;
  }

  if (showSettings) {
    return <SettingsPage />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
