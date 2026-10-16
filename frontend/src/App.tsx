import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/theme.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, PublicRoute } from "./auth/RouteGuards";
import RolePanel from "./pages/RolePanel";
import AdminUsersPage from "./pages/AdminUsersPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/" element={<AuthPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Route>
            <Route element={<ProtectedRoute role="STUDENT" />}>
              <Route path="/student" element={<RolePanel title="Panel ucznia" />} />
            </Route>
            <Route element={<ProtectedRoute role="TEACHER" />}>
              <Route path="/teacher" element={<RolePanel title="Panel nauczyciela" />} />
            </Route>
            <Route element={<ProtectedRoute role="ADMIN" />}>
              <Route path="/admin" element={<AdminUsersPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
