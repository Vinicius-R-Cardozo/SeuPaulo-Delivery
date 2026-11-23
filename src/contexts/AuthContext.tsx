import { clearAppPush } from '@/services/appPush';
import { clearCustomerLive } from '@/services/orderLive';
import { stopTracking } from '@/services/deliveryTracking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Profile, Role } from '@/types';
import { repository } from '@/services';
import type { SignUpInput } from '@/services/types';

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, role?: Role) => Promise<Profile>;
  signUp: (input: SignUpInput) => Promise<Profile>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setProfile: (p: Profile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = await repository.getSession();
    setProfileState(session?.profile ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    repository.getSession()
      .then((session) => {
        if (active) setProfileState(session?.profile ?? null);
      })
      .catch(() => {
        if (active) setProfileState(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string, role?: Role) => {
    const session = await repository.signIn(email, password, role);
    setProfileState(session.profile);
    return session.profile;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const session = await repository.signUp(input);
    setProfileState(session.profile);
    return session.profile;
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([stopTracking(), clearCustomerLive().catch(() => {}), clearAppPush().catch(() => {})]);
    await repository.signOut();
    setProfileState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refresh,
      setProfile: setProfileState,
    }),
    [profile, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
