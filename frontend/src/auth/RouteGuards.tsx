import { Navigate, Outlet } from "react-router-dom";
import type { UserRole } from "../api/auth";
import { useAuth } from "./AuthProvider";

export const ROLE_PATHS: Record<UserRole, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  ADMIN: "/admin",
};

function SessionStatus() {
  const { loading, sessionError, retrySession } = useAuth();
  return (
    <main>
      {loading ? <p role="status">Sprawdzanie sesji…</p> : (
        <>
          <p role="alert">{sessionError}</p>
          <button type="button" onClick={retrySession}>Sprawdź sesję ponownie</button>
        </>
      )}
    </main>
  );
}

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { user, loading, sessionError } = useAuth();
  if (loading || sessionError) return <SessionStatus />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={ROLE_PATHS[user.role]} replace />;
  return <Outlet />;
}

export function PublicRoute() {
  const { user, loading, sessionError } = useAuth();
  if (loading || sessionError) return <SessionStatus />;
  if (user) return <Navigate to={ROLE_PATHS[user.role]} replace />;
  return <Outlet />;
}
