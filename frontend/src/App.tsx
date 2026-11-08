import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/theme.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, PublicRoute } from "./auth/RouteGuards";
import StudentTasksPage, { StudentLayout } from "./pages/StudentTasksPage";
import StudentTaskPage from "./pages/StudentTaskPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import TeacherTasksPage, { TeacherLayout } from "./pages/TeacherTasksPage";
import TeacherGroupsPage from "./pages/TeacherGroupsPage";

import TaskFormPage from "./pages/TaskFormPage";
import TeacherSubmissionsPage from "./pages/TeacherSubmissionsPage";
import TeacherSubmissionQueuePage from "./pages/TeacherSubmissionQueuePage";

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
                <Route path="tasks/:taskId" element={<StudentTaskPage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute role="TEACHER" />}>
              <Route path="/teacher" element={<TeacherLayout />}>
                <Route index element={<Navigate to="tasks" replace />} />
                <Route path="tasks" element={<TeacherTasksPage />} />
                <Route path="groups" element={<TeacherGroupsPage />} />
                <Route path="groups/:groupId" element={<TeacherGroupsPage />} />
                <Route path="submissions" element={<TeacherSubmissionQueuePage />} />
                <Route path="submissions/tasks/:taskId/students/:studentId" element={<TeacherSubmissionsPage />} />
                <Route path="tasks/new" element={<TaskFormPage key="new" />} />
                <Route path="tasks/:taskId/edit" element={<TaskFormPage key="edit" />} />
                <Route path="tasks/:taskId/submissions" element={<TeacherSubmissionsPage />} />
                <Route path="tasks/:taskId/students/:studentId/submissions" element={<TeacherSubmissionsPage />} />
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
