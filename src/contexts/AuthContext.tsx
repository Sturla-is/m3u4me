import React, { createContext, useContext, useState } from 'react';

interface DummyUser {
  uid: string;
  email: string;
}

interface AuthContextType {
  user: DummyUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signIn: async () => {},
  logOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user] = useState<DummyUser | null>({ uid: 'local-user', email: 'local@device' });

  const signIn = async () => {};
  const logOut = async () => {};

  return (
    <AuthContext.Provider value={{ user, loading: false, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
};
