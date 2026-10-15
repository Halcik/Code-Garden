import { useEffect, useState } from "react";
import type { User } from "../api/auth";
import { AdminApiError, adminErrorMessage, changeUserStatus, getUser, listUsers, updateUser } from "../api/admin";
import type { UserAction, UserFilters, UserList } from "../api/admin";
import { useAuth } from "../auth/AuthProvider";
import LogoutButton from "../components/LogoutButton";
import ThemeSwitch from "../components/ThemeSwitch";
import DesignIcon from "../components/admin/DesignIcon";
import UserDetail from "../components/admin/UserDetail";
import { APPROVAL_LABELS, ROLE_LABELS, STATUS_LABELS, RoleBadge, StatusBadges } from "../components/admin/UserBadges";
import "../styles/admin-users.css";

const ACTION_MESSAGES: Record<UserAction, string> = {
  activate: "Konto zostało aktywowane.", deactivate: "Konto zostało dezaktywowane.",
  "approve-teacher": "Nauczyciel został zaakceptowany.", "reject-teacher": "Nauczyciel został odrzucony.",
  "revoke-teacher": "Zatwierdzenie zostało cofnięte. Konto oczekuje na ponowną akceptację.",
};

export default function AdminUsersPage() {
  const { user: actor, retrySession } = useAuth();
  const [filters, setFilters] = useState<UserFilters>({ offset: 0 });
  const [search, setSearch] = useState("");
  const [list, setList] = useState<UserList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");

  function handleSessionError(error: unknown) {
    if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) retrySession();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = search.trim() || undefined;
      setFilters(previous => previous.q === q ? previous : { ...previous, q, offset: 0 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError("");
    listUsers(filters, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.total > 0 && filters.offset >= data.total) {
        setFilters(previous => ({ ...previous, offset: Math.floor((data.total - 1) / data.limit) * data.limit }));
      }
      setList(data);
    }).catch(error => {
      if (!controller.signal.aborted) { setList(null); setListError(adminErrorMessage(error)); handleSessionError(error); }
    }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setSelectedUser(null);
    setDetailLoading(false);
    setDetailError("");
    setActionError("");
    if (selectedId === null) return () => controller.abort();
    setDetailLoading(true);
    getUser(selectedId, controller.signal).then(data => {
      if (!controller.signal.aborted) setSelectedUser(data);
    }).catch(error => {
      if (!controller.signal.aborted) { setDetailError(adminErrorMessage(error)); handleSessionError(error); }
    }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, detailAttempt]);

  async function mutate(operation: () => Promise<User>, message: string) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setFeedback("");
    try {
      const updated = await operation();
      setSelectedUser(updated);
      setFeedback(`${updated.login}: ${message}`);
      setRevision(value => value + 1);
    } catch (error) {
      setActionError(adminErrorMessage(error));
      handleSessionError(error);
    } finally { setBusy(false); }
  }

  function selectUser(id: number | null) {
    if (busy) return;
    setSelectedId(previous => previous === id ? null : id);
    setFeedback("");
    setActionError("");
  }

  function filterChange(name: keyof Omit<UserFilters, "offset">, value: string) {
    setFilters(previous => ({ ...previous, [name]: value || undefined, offset: 0 }));
  }

  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><DesignIcon name="CodeGardenLogo" /><strong>Code Garden</strong></div>
      <nav aria-label="Administracja"><a href="/admin" aria-current="page"><DesignIcon name="Users" />Użytkownicy</a></nav>
      <div className="admin-sidebar-footer">
        <div className="admin-identity"><DesignIcon name="Avatar" /><div><strong>{actor?.login}</strong><span>Administrator</span></div></div>
        <LogoutButton />
      </div>
    </aside>
    <div className="admin-application">
      <header className="admin-topbar"><span>Administracja / Użytkownicy</span><ThemeSwitch /></header>
      <main className="admin-content">
        <header className="admin-page-heading"><h1>Zarządzanie użytkownikami</h1>
          <p>Przeglądaj konta użytkowników, zatwierdzaj nauczycieli i zarządzaj dostępem do Code Garden.</p>
        </header>
        <section className="account-rules" aria-label="Zasady kont">
          <article className="admin-card"><div className="rule-heading"><span className="rule-icon"><DesignIcon name="GraduationCap" /></span><RoleBadge role="STUDENT" /></div>
            <h2>Login wymagany; e-mail opcjonalny</h2><p>Konto ucznia jest aktywne od razu po rejestracji.</p></article>
          <article className="admin-card"><div className="rule-heading"><span className="rule-icon"><DesignIcon name="Presentation" /></span><RoleBadge role="TEACHER" /></div>
            <h2>Wymagane: login, e-mail i zatwierdzenie administratora</h2><p>Dostęp nauczyciela jest dostępny po akceptacji. Sama aktywacja konta nie zastępuje akceptacji.</p></article>
          <article className="admin-card"><div className="rule-heading"><span className="rule-icon"><DesignIcon name="ShieldCheck" /></span><RoleBadge role="ADMIN" /></div>
            <h2>Zarządzanie kontami użytkowników</h2><p>Konto administratora nie jest dostępne w publicznej rejestracji. Edycja danych nie zmienia roli.</p></article>
        </section>
        <section className="admin-card admin-filters" aria-label="Filtrowanie użytkowników">
          <label className="admin-search">Szukaj użytkownika
            <input type="search" placeholder="Login lub e-mail" maxLength={254} value={search}
              disabled={busy} onChange={event => setSearch(event.target.value)} />
          </label>
          <label>Rola<select value={filters.role || ""} disabled={busy} onChange={e => filterChange("role", e.target.value)}>
            <option value="">Wszystkie role</option>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Status konta<select value={filters.status || ""} disabled={busy} onChange={e => filterChange("status", e.target.value)}>
            <option value="">Wszystkie statusy</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Akceptacja nauczyciela<select value={filters.teacher_approval || ""} disabled={busy} onChange={e => filterChange("teacher_approval", e.target.value)}>
            <option value="">Wszystkie decyzje</option>{Object.entries(APPROVAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button className="admin-button" type="button" disabled={busy || listLoading} onClick={() => setRevision(value => value + 1)}>Odśwież listę</button>
        </section>
        <div className="admin-feedback" aria-live="polite">{feedback && <p className="success-message" role="status">{feedback}</p>}</div>
        <div className="admin-user-columns">
          <section className="admin-card users-list" aria-labelledby="users-title" aria-busy={listLoading}>
            <header className="users-list-heading"><h2 id="users-title">Użytkownicy</h2><p className="muted">{listLoading ? "Pobieranie listy…" : `Liczba wyników: ${list?.total ?? 0}`}</p></header>
            {listLoading ? <p className="admin-state" role="status">Ładowanie użytkowników…</p> : listError ? <div className="admin-state"><p role="alert">{listError}</p><button className="admin-button" type="button" onClick={() => setRevision(value => value + 1)}>Spróbuj ponownie</button></div>
              : !list?.items.length ? <p className="admin-state">Brak użytkowników pasujących do filtrów.</p> : <>
                <div className="users-table-scroll"><table className="users-table"><thead><tr><th scope="col">Login</th><th scope="col">E-mail</th><th scope="col">Rola</th><th scope="col">Status</th><th scope="col">Akcje</th></tr></thead>
                  <tbody>{list.items.map(user => <tr key={user.id} className={selectedId === user.id ? "selected" : ""}>
                    <td><strong>{user.login}</strong></td><td>{user.email || <span className="muted">Brak e-maila</span>}</td>
                    <td><RoleBadge role={user.role} /></td><td><StatusBadges user={user} /></td>
                    <td><button className="admin-text-button" type="button" disabled={busy} aria-pressed={selectedId === user.id}
                      aria-label={`${selectedId === user.id ? "Odznacz" : "Otwórz"} użytkownika ${user.login}`} onClick={() => selectUser(user.id)}>
                      {selectedId === user.id ? "Odznacz" : "Otwórz"}</button></td>
                  </tr>)}</tbody></table></div>
                <div className="admin-pagination"><button className="admin-button" type="button" disabled={busy || list.offset === 0}
                  onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, previous.offset - list.limit) }))}>Poprzednia</button>
                  <span>{list.offset + 1}–{list.offset + list.items.length} z {list.total}</span>
                  <button className="admin-button" type="button" disabled={busy || list.offset + list.limit >= list.total}
                    onClick={() => setFilters(previous => ({ ...previous, offset: previous.offset + list.limit }))}>Następna</button></div>
              </>}
          </section>
          <aside className="user-detail-column" aria-label="Szczegóły użytkownika" aria-busy={busy || detailLoading}>
            {selectedId !== null && <button className="admin-text-button" type="button" disabled={busy}
              onClick={() => selectUser(null)}>Zamknij szczegóły</button>}
            {detailLoading ? <div className="admin-card admin-state" role="status">Ładowanie danych konta…</div>
              : detailError ? <div className="admin-card admin-state"><p role="alert">{detailError}</p><button className="admin-button" type="button" onClick={() => setDetailAttempt(value => value + 1)}>Spróbuj ponownie</button></div>
                : selectedUser ? <UserDetail user={selectedUser} actorId={actor!.id} busy={busy}
                  onSave={data => mutate(() => updateUser(selectedUser.id, data), "Dane konta zostały zapisane.")}
                  onAction={action => mutate(() => changeUserStatus(selectedUser.id, action), ACTION_MESSAGES[action])} />
                  : <section className="admin-card admin-state"><h2>Szczegóły użytkownika</h2><p>Wybierz „Otwórz” przy koncie na liście, aby zobaczyć dane i dostępne akcje.</p></section>}
            {busy && <p role="status">Zapisywanie zmian…</p>}
            {actionError && <p className="error-message" role="alert">{actionError}</p>}
          </aside>
        </div>
      </main>
    </div>
  </div>;
}
