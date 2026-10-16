import type { AccountStatus, TeacherApproval, User, UserRole } from "../../api/auth";

export const ROLE_LABELS: Record<UserRole, string> = { STUDENT: "Uczeń", TEACHER: "Nauczyciel", ADMIN: "Administrator" };
export const STATUS_LABELS: Record<AccountStatus, string> = { ACTIVE: "Aktywne", INACTIVE: "Nieaktywne" };
export const APPROVAL_LABELS: Record<TeacherApproval, string> = { PENDING: "Oczekuje na akceptację", APPROVED: "Zaakceptowany", REJECTED: "Odrzucony" };

export function RoleBadge({ role }: { role: UserRole }) {
  return <span className="user-badge role-badge">{ROLE_LABELS[role]}</span>;
}

export function StatusBadges({ user }: { user: User }) {
  return <span className="user-statuses">
    <span className={`user-badge status-${user.status.toLowerCase()}`}>{STATUS_LABELS[user.status]}</span>
    {user.teacher_approval && <span className={`user-badge approval-${user.teacher_approval.toLowerCase()}`}>
      {APPROVAL_LABELS[user.teacher_approval]}
    </span>}
  </span>;
}
