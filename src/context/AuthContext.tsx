import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sla_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sla_token'));

  const login = async (username: string, password: string) => {
    // Mock login
    const mockUsers = [
      { id: 1, username: 'admin', role: 'admin' as UserRole, is_active: true, created_at: '2024-01-01' },
      { id: 2, username: 'planner', role: 'planner' as UserRole, is_active: true, created_at: '2024-01-01' },
      { id: 3, username: 'viewer', role: 'viewer' as UserRole, is_active: true, created_at: '2024-01-01' },
    ];
    const found = mockUsers.find(u => u.username === username);
    if (!found) throw new Error('Неверный логин или пароль');
    if (password.length < 3) throw new Error('Неверный логин или пароль');
    
    setUser(found);
    setToken('mock-token');
    localStorage.setItem('sla_user', JSON.stringify(found));
    localStorage.setItem('sla_token', 'mock-token');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
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
