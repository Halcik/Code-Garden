import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import type { Group } from "../../api/groups";
import GroupDialog from "./GroupDialog";
import GroupCodePanel from "./GroupCodePanel";
import GroupMembers from "./GroupMembers";
import GroupTaskAssignments from "./GroupTaskAssignments";

type Props = {
  group: Group; editing: boolean; pending: boolean; confirmDelete: boolean; deleteError: string;
  onEdit: () => void; onDelete: () => void; onCancelDelete: () => void; onConfirmDelete: () => void;
  onInvite: () => void; onAssign: () => void; onChanged: () => void; assignmentRevision: number;
};

export default function GroupDetails({ group, editing, pending, confirmDelete, deleteError, onEdit, onDelete, onCancelDelete, onConfirmDelete, onInvite, onAssign, onChanged, assignmentRevision }: Props) {
  const [view, setView] = useState<"students" | "tasks">("students");
  useEffect(() => { if (assignmentRevision > 0) setView("tasks"); }, [assignmentRevision]);
  return <div className="group-detail-view">
    <div className="teacher-heading admin-page-heading group-detail-heading">
      <div className="group-detail-title"><Link className="group-breadcrumb" to="/teacher/groups">Grupy / Aktywne</Link>
        <h1>{group.name}</h1>
        <p>Liczba uczniów: {group.student_count}{group.age_range ? ` · Wiek ${group.age_range}` : ""} · Utworzono {new Date(group.created_at).toLocaleDateString("pl-PL")}</p>
        <p className="group-description">{group.description || "Brak opisu."}</p>
      </div>
      <div className="group-detail-actions">
        <button className="admin-button primary" disabled={editing || pending} onClick={onAssign}><span className="group-detail-icon assign" aria-hidden="true" />Przypisz zadanie</button>
      </div>
    </div>
    <section className="teacher-metrics" aria-label="Statystyki grupy">
      {[
        { title: "Średni poziom ukończenia", icon: "progress", note: "Postępy grupy wkrótce" },
        { title: "Aktywne zadania", icon: "tasks", note: "Gotowe zadania przypisane grupie", value: group.active_task_count ?? 0 },
        { title: "Uczniowie z zadaniami po terminie", icon: "alert", note: "Terminy zadań wkrótce" },
        { title: "Wymaga oceny", icon: "reviews", note: "Rozwiązania grupy wkrótce" },
      ].map(metric => <article className="admin-card teacher-metric" key={metric.title}>
        <div className="teacher-metric-heading"><h2>{metric.title}</h2><span className={`group-metric-icon group-metric-${metric.icon}`} aria-hidden="true" /></div>
        <p className="teacher-metric-value">{metric.value ?? "—"}</p><p className="teacher-metric-note">{metric.note}</p>
      </article>)}
    </section>
    <div className="admin-card teacher-tabs group-detail-tabs" role="group" aria-label="Widoki grupy">
      <button type="button" aria-pressed={view === "students"} onClick={() => setView("students")}>Uczniowie</button>
      <button type="button" aria-pressed={view === "tasks"} onClick={() => setView("tasks")}>Zadania</button>
      <button type="button" disabled title="Postępy grupy będą dostępne w kolejnym etapie">Postęp</button>
    </div>
    <div className="group-detail-columns">
      {view === "students" ? <GroupMembers group={group} onInvite={onInvite} onChanged={onChanged} />
        : <GroupTaskAssignments key={group.id} groupId={group.id} revision={assignmentRevision} onAssign={onAssign} onChanged={onChanged} />}
      <aside className="group-detail-sidebar" aria-label="Informacje i zarządzanie grupą">
        <GroupCodePanel key={group.id} groupId={group.id} />
        <section className="admin-card group-card"><h2>Status zadania</h2><p className="group-assignment-value">—</p>
          <p className="group-description">Przypisz zadanie przyciskiem u góry. Listę przypisań i możliwość ich usunięcia znajdziesz w zakładce Zadania.</p>
          <div className="group-empty-track" aria-hidden="true" />
        </section>
        <section className="admin-card group-card"><h2>Zarządzanie grupą</h2>
          <div className="group-management-actions">
            <button className="admin-button group-detail-secondary" onClick={onInvite}>Zarządzaj zaproszeniami</button>
            <div className="group-management-row">
              <button className="admin-button primary" disabled={editing || pending} onClick={onEdit}>Edytuj grupę</button>
              <button className="admin-button submission-return-button" disabled={editing || pending} onClick={onDelete}>Usuń grupę</button>
            </div>
          </div>
        </section>
      </aside>
    </div>
    {confirmDelete && <GroupDialog labelledBy="group-delete-heading" describedBy="group-delete-description"
      onCancel={() => { if (!pending) onCancelDelete(); }}>
      <h2 id="group-delete-heading">Potwierdzenie usunięcia</h2>
      <p id="group-delete-description">Czy na pewno usunąć grupę „{group.name}”? Tej operacji nie można cofnąć.</p>
      {deleteError && <p role="alert">{deleteError}</p>}
      <div className="group-actions"><button className="admin-button" autoFocus disabled={pending} onClick={onCancelDelete}>Anuluj</button>
        <button className="admin-button primary" disabled={pending} onClick={onConfirmDelete}>{pending ? "Usuwanie…" : "Potwierdź usunięcie"}</button></div>
    </GroupDialog>}
  </div>;
}
