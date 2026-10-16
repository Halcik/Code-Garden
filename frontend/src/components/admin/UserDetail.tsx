import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "../../api/auth";
import type { UserAction } from "../../api/admin";
import { RoleBadge, StatusBadges } from "./UserBadges";
import DesignIcon from "./DesignIcon";

export default function UserDetail({ user, actorId, busy, onSave, onAction }: {
  user: User;
  actorId: number;
  busy: boolean;
  onSave: (data: { login: string; email: string | null }) => Promise<void>;
  onAction: (action: UserAction) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState(user.login);
  const [email, setEmail] = useState(user.email || "");

  useEffect(() => {
    setLogin(user.login);
    setEmail(user.email || "");
    setEditing(false);
  }, [user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ login: login.trim(), email: email.trim() || null });
  }

  return <section className="admin-card user-detail" aria-labelledby="user-detail-title">
    <div className="user-detail-heading">
      <span className="user-avatar" aria-hidden="true">{user.login.slice(0, 2).toUpperCase()}</span>
      <div><h2 id="user-detail-title">{user.login}</h2><span className="muted">ID: {user.id}</span></div>
    </div>
    <StatusBadges user={user} />
    <dl className="user-data">
      <div><dt>Rola</dt><dd><RoleBadge role={user.role} /></dd></div>
      <div><dt>E-mail</dt><dd>{user.email || "Brak e-maila"}</dd></div>
      <div><dt>Utworzono</dt><dd>{new Date(user.created_at).toLocaleString("pl-PL")}</dd></div>
    </dl>
    {user.role === "TEACHER" && user.teacher_approval !== "APPROVED" && <p className="approval-notice">
      <DesignIcon name="ShieldAlert" />
      Dostęp nauczyciela wymaga aktywnego konta i akceptacji administratora.
    </p>}
    <div className="admin-actions">
      {user.role === "TEACHER" && (user.teacher_approval === "APPROVED" ? (
        <button className="admin-button danger" type="button" disabled={busy}
          onClick={() => onAction("revoke-teacher")}>Cofnij zatwierdzenie</button>
      ) : <>
        <button className="admin-button primary" type="button" disabled={busy}
          onClick={() => onAction("approve-teacher")}><DesignIcon name="Check" />Zatwierdź nauczyciela</button>
        <button className="admin-button danger" type="button" disabled={busy || user.teacher_approval === "REJECTED"}
          onClick={() => onAction("reject-teacher")}>Odrzuć nauczyciela</button>
      </>)}
      <button className={`admin-button ${user.status === "ACTIVE" ? "danger" : "primary"}`} type="button"
        disabled={busy || (user.id === actorId && user.status === "ACTIVE")}
        onClick={() => onAction(user.status === "ACTIVE" ? "deactivate" : "activate")}>
        {user.status === "ACTIVE" ? "Dezaktywuj konto" : "Aktywuj konto"}
      </button>
    </div>
    {user.id === actorId && <p className="muted">Nie możesz dezaktywować własnego konta.</p>}
    <button className="admin-text-button" type="button" disabled={busy} onClick={() => setEditing(!editing)}>
      {editing ? "Anuluj edycję" : "Edytuj dane konta"}
    </button>
    {editing && <form className="user-edit-form" onSubmit={save}>
      <label>Login<input required minLength={3} maxLength={50} pattern="[a-zA-Z0-9_.\-]+" value={login}
        onChange={event => setLogin(event.target.value)} disabled={busy} /></label>
      <label>E-mail{user.role !== "TEACHER" && " (opcjonalnie)"}
        <input type="email" required={user.role === "TEACHER"} maxLength={254} value={email}
          onChange={event => setEmail(event.target.value)} disabled={busy} />
      </label>
      <button className="admin-button primary" type="submit" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz dane"}</button>
    </form>}
  </section>;
}
