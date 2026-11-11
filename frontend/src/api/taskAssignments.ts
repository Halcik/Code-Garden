import { apiFetch } from "./client";
import type { StudentIdentity } from "./groupInvitations";

export type TaskAssignment = {
  id: number; task_id: number; student_id: number; student_login: string;
  assigned_by_teacher_id: number; group_id: number | null; group_name: string | null; created_at: string;
  source_group_id?: number | null; deadline?: string | null;
};
export type GroupAssignmentResult = { total_students: number; assigned_count: number; already_assigned_count: number };
export class AssignmentsApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const errors: Record<string, string> = {
  "Task unavailable for assignment": "Nie masz dostępu do tego zadania lub nie jest ono gotowe do przypisania.",
  "Student not found": "Nie znaleziono ucznia.",
  "Assignment recipient must be a student": "Wybrany użytkownik nie jest uczniem.",
  "Student does not belong to your groups": "Uczeń nie należy do żadnej Twojej grupy. Odśwież listę uczniów.",
  "Student already has this task assigned": "Uczeń ma już przypisane to zadanie.",
  "Group not found": "Nie znaleziono grupy lub nie masz do niej dostępu.",
  "Assignment not found": "Nie znaleziono przypisania lub nie masz prawa go cofnąć.",
};
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...options, headers: { "Content-Type": "application/json" } });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new AssignmentsApiError(errors[data?.detail] ?? (response.status === 401
      ? "Sesja wygasła. Zaloguj się ponownie." : response.status === 403
      ? "Nie masz uprawnień do przypisywania zadań." : "Nie udało się wykonać operacji. Spróbuj ponownie."), response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const searchAssignmentStudents = (q: string, signal: AbortSignal) =>
  request<StudentIdentity[]>(`/teacher/assignment-students?${new URLSearchParams({ q })}`, { signal });
export const listTaskAssignments = (id: string, signal: AbortSignal) =>
  request<TaskAssignment[]>(`/teacher/tasks/${id}/assignments`, { signal });
export const assignTaskToStudent = (id: string, student_id: number, signal: AbortSignal, deadline?: string | null) =>
  request<TaskAssignment>(`/teacher/tasks/${id}/assignments`, { method: "POST", body: JSON.stringify({ student_id, ...(deadline !== undefined ? { deadline } : {}) }), signal });
export const assignTaskToGroup = (id: string, group_id: number, signal: AbortSignal, deadline?: string | null) =>
  request<GroupAssignmentResult>(`/teacher/tasks/${id}/group-assignments`, { method: "POST", body: JSON.stringify({ group_id, ...(deadline !== undefined ? { deadline } : {}) }), signal });

export const revokeTaskAssignment = (taskId: string, assignmentId: number, signal: AbortSignal) =>
  request<void>(`/teacher/tasks/${taskId}/assignments/${assignmentId}`, { method: "DELETE", signal });

export type GroupTaskAssignment = {
  task_id: number; title: string; topic: string; difficulty: "EASY" | "MEDIUM" | "HARD";
  is_archived: boolean; student_count: number; created_at: string; deadline?: string | null; deadlines_differ?: boolean;
};
export const listGroupTaskAssignments = (groupId: number, signal: AbortSignal) =>
  request<GroupTaskAssignment[]>(`/teacher/groups/${groupId}/task-assignments`, { signal });
export const removeGroupTaskAssignment = (groupId: number, taskId: number, signal: AbortSignal) =>
  request<void>(`/teacher/groups/${groupId}/task-assignments/${taskId}`, { method: "DELETE", signal });

export const updateAssignmentDeadline = (taskId: string, assignmentId: number, deadline: string | null, signal: AbortSignal) =>
  request<TaskAssignment>(`/teacher/tasks/${taskId}/assignments/${assignmentId}`, { method: "PATCH", body: JSON.stringify({ deadline }), signal });

export const updateGroupAssignmentDeadline = (groupId: number, taskId: number, deadline: string | null, signal: AbortSignal) =>
  request<void>(`/teacher/groups/${groupId}/task-assignments/${taskId}`, { method: "PATCH", body: JSON.stringify({ deadline }), signal });
