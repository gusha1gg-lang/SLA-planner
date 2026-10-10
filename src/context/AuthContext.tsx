import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';
import { realApi } from '../api/realClient';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Есть ли право (одно или все из списка); admin — всегда true. */
  can: (permission: string | string[]) => boolean;
  /** Полная роль без групп. */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Сессия старого формата (роли planner/viewer, без permissions) — форсим повторный логин. */
function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('sla_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!Array.isArray(parsed.permissions)) return null;
    return parsed as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Токен реального API; устаревшие mock-токены вычищаем — сайт работает только с живыми данными
  const [user, setUser] = useState<User | null>(() => {
    const stored = loadStoredUser();
    if (!stored) {
      localStorage.removeItem('sla_user');
      localStorage.removeItem('sla_token');
    }
    return stored;
  });
  const [token, setToken] = useState<string | null>(() => {
    const storedUser = loadStoredUser();
    const storedToken = localStorage.getItem('sla_token');
    if (!storedUser || !storedToken) return null;
    realApi.setToken(storedToken);
    return storedToken;
  });

  const login = async (username: string, password: string) => {
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

  const can = (permission: string | string[]): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const owned = new Set(user.permissions || []);
    const required = Array.isArray(permission) ? permission : [permission];
    return required.every(p => owned.has(p));
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, token, login, logout, can, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}