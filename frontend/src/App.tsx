import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/theme.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, PublicRoute } from "./auth/RouteGuards";
import StudentTasksPage, { StudentLayout, StudentTaskPlaceholder } from "./pages/StudentTasksPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import TeacherTasksPage, { TeacherLayout } from "./pages/TeacherTasksPage";

import TaskFormPage from "./pages/TaskFormPage";

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
              <Route path="/student" element={<StudentLayout />}>
                <Route index element={<Navigate to="tasks" replace />} />
                <Route path="tasks" element={<StudentTasksPage />} />
                <Route path="tasks/:taskId" element={<StudentTaskPlaceholder />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute role="TEACHER" />}>
              <Route path="/teacher" element={<TeacherLayout />}>
                <Route index element={<Navigate to="tasks" replace />} />
                <Route path="tasks" element={<TeacherTasksPage />} />
                <Route path="tasks/new" element={<TaskFormPage key="new" />} />
                <Route path="tasks/:taskId/edit" element={<TaskFormPage key="edit" />} />
              </Route>
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
