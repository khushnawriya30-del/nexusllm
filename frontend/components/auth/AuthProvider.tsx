"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseEnabled, getFirebaseAuth } from "@/lib/firebase";
import { setIdToken } from "@/lib/auth";

interface AuthState {
  /** Whether Firebase is configured at all (env vars present). */
  enabled: boolean;
  /** The signed-in user, or null. Always null when Firebase is disabled. */
  user: User | null;
  /** True until the initial auth state has resolved. */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  enabled: false,
  user: null,
  loading: false,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);

  // Track auth state + keep the cached ID token fresh.
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onIdTokenChanged(auth, async (u) => {
      setUser(u);
      setIdToken(u ? await u.getIdToken() : null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Refresh the token well before its ~1h expiry so long sessions don't 401.
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const id = setInterval(
      async () => {
        const u = auth.currentUser;
        if (u) setIdToken(await u.getIdToken(true));
      },
      30 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(auth, provider);
    setIdToken(await cred.user.getIdToken());
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
    setIdToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ enabled: firebaseEnabled, user, loading, signInWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
