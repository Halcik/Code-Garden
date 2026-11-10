import { groupRequest } from "./groups";

export type StudentIdentity = { id: number; login: string };
export type GroupInvitation = {
  id: number; group_id: number; group_name: string; teacher_login: string;
  student_id: number; student_login: string; status: "PENDING" | "ACCEPTED" | "REJECTED"; created_at: string;
};
export type InvitationCode = { code: string; created_at: string; expires_at: string };
export type StudentGroup = { id: number; name: string; description: string | null; age_range: string | null;
  active_task_count?: number;
  teacher_login: string; student_count: number; created_at: string };
const base = (id: number) => `/teacher/groups/${id}`;
export const searchGroupStudents = (id: number, q: string, signal: AbortSignal) => groupRequest<StudentIdentity[]>(`${base(id)}/students/search?${new URLSearchParams({ q })}`, { signal });
export const inviteStudent = (id: number, login: string) => groupRequest<GroupInvitation>(`${base(id)}/invitations`, { method: "POST", body: JSON.stringify({ login }) });
export const listGroupInvitations = (id: number, signal: AbortSignal) => groupRequest<GroupInvitation[]>(`${base(id)}/invitations`, { signal });
export const cancelGroupInvitation = (id: number, invitationId: number) => groupRequest<void>(`${base(id)}/invitations/${invitationId}`, { method: "DELETE" });
export const listGroupMembers = (id: number, signal: AbortSignal) => groupRequest<StudentIdentity[]>(`${base(id)}/members`, { signal });
export const removeGroupMember = (id: number, studentId: number) => groupRequest<void>(`${base(id)}/members/${studentId}`, { method: "DELETE" });
export const getInvitationCode = (id: number, signal: AbortSignal) => groupRequest<InvitationCode | null>(`${base(id)}/invitation-code`, { signal });
export const generateInvitationCode = (id: number, value: number, unit: "hours" | "days") => groupRequest<InvitationCode>(`${base(id)}/invitation-code`, { method: "POST", body: JSON.stringify({ value, unit }) });
export const listStudentGroups = (signal: AbortSignal) => groupRequest<StudentGroup[]>("/student/groups", { signal });
export const getStudentGroup = (id: string, signal: AbortSignal) => groupRequest<StudentGroup>(`/student/groups/${id}`, { signal });
export const listStudentInvitations = (signal: AbortSignal) => groupRequest<GroupInvitation[]>("/student/group-invitations", { signal });
export const answerGroupInvitation = (id: number, accepted: boolean) => groupRequest<void>(`/student/group-invitations/${id}/${accepted ? "accept" : "reject"}`, { method: "POST" });
export const joinGroupByCode = (code: string) => groupRequest<StudentGroup>("/student/groups/join", { method: "POST", body: JSON.stringify({ code }) });
export const leaveStudentGroup = (id: number) => groupRequest<void>(`/student/groups/${id}/membership`, { method: "DELETE" });
