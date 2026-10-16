import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import * as authApi from "../api/auth";
import type { LoginRequest, User } from "../api/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  sessionError: string;
  signIn: (data: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  retrySession: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSessionError("");
    authApi.getCurrentUser(controller.signal)
      .then((currentUser) => {
        if (!controller.signal.aborted) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSessionError(authApi.authErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sessionAttempt]);

  useEffect(() => {
    if (userId === undefined) return;
    const controller = new AbortController();
    let pending = false;
    async function refreshSession() {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const currentUser = await authApi.getCurrentUser(controller.signal);
        if (!controller.signal.aborted) {
          setUser(currentUser);
          setSessionError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setSessionError(authApi.authErrorMessage(error));
      } finally {
        pending = false;
      }
    }
    window.addEventListener("focus", refreshSession);
    document.addEventListener("visibilitychange", refreshSession);
    const interval = window.setInterval(refreshSession, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSession);
      document.removeEventListener("visibilitychange", refreshSession);
    };
  }, [userId]);

  async function signIn(data: LoginRequest) {
    await authApi.login(data);
    const currentUser = await authApi.getCurrentUser();
    if (!currentUser) {
      throw new authApi.AuthApiError("Nie udało się potwierdzić sesji. Spróbuj zalogować się ponownie.");
    }
    setUser(currentUser);
    setSessionError("");
  }

  async function signOut() {
    await authApi.logout();
    setUser(null);
    setSessionError("");
  }

  const retrySession = useCallback(() => {
    setLoading(true);
    setSessionAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionError, signIn, signOut, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth musi być użyty wewnątrz AuthProvider.");
  return context;
}
