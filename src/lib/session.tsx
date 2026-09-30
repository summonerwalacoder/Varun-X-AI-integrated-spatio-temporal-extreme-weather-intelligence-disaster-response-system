/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError, isUnauthenticated } from "./api";

/** Roles that exist in the backend database. */
export type ServerRole = "citizen" | "authority_viewer" | "authority_officer" | "authority_admin";

/** Coarse UI role retained for compatibility with the existing navigation. */
export type SessionRole = "public" | "read-only" | "command";

export interface ServerUser {
  id: string;
  role: ServerRole;
  email: string | null;
  phone: string | null;
  name: string;
  department: string | null;
  staffId: string | null;
  mfaEnabled: boolean;
  isDemo: boolean;
  permissions: string[];
  createdAt: number;
  lastLoginAt: number | null;
}

export interface Session {
  /** Coarse UI role. */
  role: SessionRole;
  /** Exact backend role. */
  serverRole: ServerRole;
  at: string;
  name?: string;
  staffId?: string;
  user: ServerUser;
}

export function uiRoleFor(serverRole: ServerRole): SessionRole {
  if (serverRole === "citizen") return "public";
  if (serverRole === "authority_viewer") return "read-only";
  return "command";
}

function toSession(user: ServerUser): Session {
  return {
    role: uiRoleFor(user.role),
    serverRole: user.role,
    at: new Date().toISOString(),
    name: user.name,
    staffId: user.staffId ?? undefined,
    user,
  };
}

/** True when the session has any authority role. */
export function isAuthority(s: Session | null): boolean {
  return !!s && s.serverRole !== "citizen";
}

/** True only for roles allowed to write operations records. */
export function isCommand(s: Session | null): boolean {
  return !!s && (s.serverRole === "authority_officer" || s.serverRole === "authority_admin");
}

export function can(s: Session | null, permission: string): boolean {
  return !!s && s.user.permissions.includes(permission);
}

interface AuthContextValue {
  session: Session | null;
  user: ServerUser | null;
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  signInCitizen: (identifier: string, password: string) => Promise<Session>;
  requestCitizenOtp: (phone: string) => Promise<{ devCode?: string; demoNotice?: string | null }>;
  signInCitizenOtp: (phone: string, code: string) => Promise<Session>;
  registerCitizen: (input: { name: string; email: string; phone?: string; password: string }) => Promise<void>;
  signInAuthority: (
    identifier: string,
    password: string,
  ) => Promise<{
    mfaRequired: boolean;
    devCode?: string;
    demoNotice?: string | null;
    user?: ServerUser;
  }>;
  verifyAuthorityMfa: (identifier: string, code: string) => Promise<Session>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ authenticated: boolean; user: ServerUser | null; demoMode?: boolean }>(
        "/api/auth/session",
      );
      setDemoMode(res.demoMode ?? true);
      setSession(res.authenticated && res.user ? toSession(res.user) : null);
      setError(null);
    } catch (err) {
      setSession(null);
      if (!isUnauthenticated(err)) {
        setError(err instanceof ApiError ? err.message : "Unable to reach the VARUN-X server");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInCitizen = useCallback(async (identifier: string, password: string) => {
    const res = await api<{ user: ServerUser }>("/api/auth/citizen/login", {
      method: "POST",
      body: { identifier, password },
    });
    const next = toSession(res.user);
    setSession(next);
    return next;
  }, []);

  const requestCitizenOtp = useCallback(async (phone: string) => {
    return api<{ devCode?: string; demoNotice?: string | null }>("/api/auth/citizen/otp/request", {
      method: "POST",
      body: { phone },
    });
  }, []);

  const signInCitizenOtp = useCallback(async (phone: string, code: string) => {
    const res = await api<{ user: ServerUser }>("/api/auth/citizen/otp/verify", {
      method: "POST",
      body: { phone, code },
    });
    const next = toSession(res.user);
    setSession(next);
    return next;
  }, []);

  const registerCitizen = useCallback(
    async (input: { name: string; email: string; phone?: string; password: string }) => {
      await api("/api/auth/citizen/register", { method: "POST", body: input });
    },
    [],
  );

  const signInAuthority = useCallback(async (identifier: string, password: string) => {
    const res = await api<{
      mfaRequired: boolean;
      devCode?: string;
      demoNotice?: string | null;
      user?: ServerUser;
    }>("/api/auth/authority/login", { method: "POST", body: { identifier, password } });
    if (res.user) setSession(toSession(res.user));
    return res;
  }, []);

  const verifyAuthorityMfa = useCallback(async (identifier: string, code: string) => {
    const res = await api<{ user: ServerUser }>("/api/auth/authority/mfa", {
      method: "POST",
      body: { identifier, code },
    });
    const next = toSession(res.user);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* clearing the local state is enough */
    }
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      error,
      demoMode,
      signInCitizen,
      requestCitizenOtp,
      signInCitizenOtp,
      registerCitizen,
      signInAuthority,
      verifyAuthorityMfa,
      signOut,
      refresh,
    }),
    [
      session,
      loading,
      error,
      demoMode,
      signInCitizen,
      requestCitizenOtp,
      signInCitizenOtp,
      registerCitizen,
      signInAuthority,
      verifyAuthorityMfa,
      signOut,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSession must be used inside <AuthProvider>");
  return ctx;
}
