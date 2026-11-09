import { Link } from "react-router-dom";
import type { Group } from "../../api/groups";
import GroupDialog from "./GroupDialog";
import GroupCodePanel from "./GroupCodePanel";
import GroupMembers from "./GroupMembers";

type Props = {
  group: Group; editing: boolean; pending: boolean; confirmDelete: boolean; deleteError: string;
  onEdit: () => void; onDelete: () => void; onCancelDelete: () => void; onConfirmDelete: () => void;
  onInvite: () => void; onChanged: () => void;
};

export default function GroupDetails({ group, editing, pending, confirmDelete, deleteError, onEdit, onDelete, onCancelDelete, onConfirmDelete, onInvite, onChanged }: Props) {
  return <div className="group-detail-view">
    <div className="teacher-heading admin-page-heading group-detail-heading">
      <div className="group-detail-title"><Link className="group-breadcrumb" to="/teacher/groups">Grupy / Aktywne</Link>
        <h1>{group.name}</h1>
        <p>Liczba uczniów: {group.student_count}{group.age_range ? ` · Wiek ${group.age_range}` : ""} · Utworzono {new Date(group.created_at).toLocaleDateString("pl-PL")}</p>
        <p className="group-description">{group.description || "Brak opisu."}</p>
      </div>
      <div className="group-detail-actions">
        <button className="admin-button primary" disabled title="Przypisywanie zadań będzie dostępne w kolejnym etapie"><span className="group-detail-icon assign" aria-hidden="true" />Przypisz zadanie</button>
      </div>
    </div>
    <section className="teacher-metrics" aria-label="Statystyki grupy">
      {[
        { title: "Średni poziom ukończenia", icon: "progress", note: "Postępy grupy wkrótce" },
        { title: "Aktywne zadania", icon: "tasks", note: "Przypisywanie zadań wkrótce" },
        { title: "Uczniowie z zadaniami po terminie", icon: "alert", note: "Terminy zadań wkrótce" },
        { title: "Wymaga oceny", icon: "reviews", note: "Rozwiązania grupy wkrótce" },
      ].map(metric => <article className="admin-card teacher-metric" key={metric.title}>
        <div className="teacher-metric-heading"><h2>{metric.title}</h2><span className={`group-metric-icon group-metric-${metric.icon}`} aria-hidden="true" /></div>
        <p className="teacher-metric-value">—</p><p className="teacher-metric-note">{metric.note}</p>
      </article>)}
    </section>
    <div className="admin-card teacher-tabs group-detail-tabs" role="group" aria-label="Widoki grupy">
      <button type="button" aria-pressed="true">Uczniowie</button>
      <button type="button" disabled title="Zadania grupy będą dostępne w kolejnym etapie">Zadania</button>
      <button type="button" disabled title="Postępy grupy będą dostępne w kolejnym etapie">Postęp</button>
    </div>
    <div className="group-detail-columns">
      <GroupMembers group={group} onInvite={onInvite} onChanged={onChanged} />
      <aside className="group-detail-sidebar" aria-label="Informacje i zarządzanie grupą">
        <GroupCodePanel key={group.id} groupId={group.id} />
        <section className="admin-card group-card"><h2>Status zadania</h2><p className="group-assignment-value">—</p>
          <p className="group-description">Przypisywanie zadań do grup będzie dostępne w kolejnym etapie.</p>
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
