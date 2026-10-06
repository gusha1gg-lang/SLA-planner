import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { realApi } from '../api/realClient';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Токен реального API; устаревшие mock-токены вычищаем — сайт работает только с живыми данными
  const [user, setUser] = useState<User | null>(() => {
    const savedToken = localStorage.getItem('sla_token');
    if (!savedToken || savedToken === 'mock-token' || savedToken === 'mock-jwt-token') {
      localStorage.removeItem('sla_token');
      localStorage.removeItem('sla_user');
      return null;
    }
    const saved = localStorage.getItem('sla_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('sla_token');
    if (!saved || saved === 'mock-token' || saved === 'mock-jwt-token') {
      return null;
    }
    realApi.setToken(saved);
    return saved;
  });

  const login = async (username: string, password: string) => {
    // Только реальный API: мок-фолбэк запрещён
    const result = await realApi.login(username, password);
    setUser(result.user);
    setToken(result.token);
    localStorage.setItem('sla_user', JSON.stringify(result.user));
    localStorage.setItem('sla_token', result.token);
    realApi.setToken(result.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    realApi.setToken(null);
    localStorage.removeItem('sla_user');
    localStorage.removeItem('sla_token');
  };

  const hasRole = (roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
