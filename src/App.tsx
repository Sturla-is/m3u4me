import React, { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import { useStore } from './store';

function AppContent() {
  const { isDarkMode, isAmoledMode } = useStore();

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

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
