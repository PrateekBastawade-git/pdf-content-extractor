import { createContext, useContext, useState } from 'react';
import { login as loginApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    // Check session storage on initial load
    const saved = sessionStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (email, password) => {
    // Delegates to the backend, which checks real credentials.
    // Throws on invalid credentials or network failure — callers should catch.
    const { email: verifiedEmail, token } = await loginApi(email, password);
    const userData = { email: verifiedEmail, token };
    setUser(userData);
    sessionStorage.setItem('auth_user', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
