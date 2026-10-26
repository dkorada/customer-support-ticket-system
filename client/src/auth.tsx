import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { api, session } from './lib/api';
import type { User } from './lib/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (id: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue>({ user: null, loading: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState(session.get());
  const me = useQuery({
    queryKey: ['me', userId],
    queryFn: api.me,
    enabled: !!userId,
    retry: false,
    staleTime: Infinity,
  });

  const signIn = (id: string) => {
    session.set(id);
    queryClient.clear();
    setUserId(id);
  };
  const signOut = () => {
    session.set(null);
    queryClient.clear();
    setUserId(null);
  };

  const user = userId && me.data ? me.data : null;
  return (
    <AuthContext.Provider value={{ user, loading: !!userId && me.isPending, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
