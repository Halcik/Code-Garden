import { Link } from "react-router-dom";
import type { StudentTask } from "../api/studentTasks";
import { REVIEW_LABELS } from "../api/reviews";
import TaskBadges from "./TaskBadges";
import codeIcon from "../assets/student/code.svg";
import pendingIcon from "../assets/submissions/queue-Inbox.svg";
import acceptedIcon from "../assets/submissions/queue-CircleCheckBig.svg";
import changesIcon from "../assets/submissions/queue-RotateCcw.svg";

const reviewIcons = { PENDING: pendingIcon, ACCEPTED: acceptedIcon, CHANGES_REQUESTED: changesIcon };
const progressLabels = { NOT_STARTED: "Nierozpoczęte", IN_PROGRESS: "W toku", COMPLETED: "Ukończone" };

export default function StudentTaskCard({ task }: { task: StudentTask }) {
  return <article className="admin-card student-task-card">
    <div className="student-card-heading">
      <span className="student-topic-icon"><span aria-hidden="true" style={{ maskImage: `url("${codeIcon}")` }} /></span>
      <span className="student-progress-badge" data-progress={task.progress_status ?? "NOT_STARTED"} data-review={task.progress_status === "COMPLETED" ? task.review_status ?? "PENDING" : undefined}>
        {task.progress_status === "COMPLETED" && <span className="student-review-icon" aria-hidden="true" style={{ maskImage: `url("${reviewIcons[task.review_status ?? "PENDING"]}")` }} />}
        {task.progress_status === "COMPLETED" ? REVIEW_LABELS[task.review_status ?? "PENDING"] : progressLabels[task.progress_status ?? "NOT_STARTED"]}
      </span>
    </div>
    <h2><Link to={`/student/tasks/${task.id}`}>{task.title}</Link></h2><p className="student-description">{task.description}</p>
    <TaskBadges task={task} />
    {task.deadline && <p className="student-task-deadline">Termin: <time dateTime={task.deadline}>{new Date(task.deadline).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time>{task.is_overdue && <strong> · po terminie</strong>}</p>}
    <div className="student-card-footer"><span>{task.estimated_time_minutes == null ? "Czas nieokreślony" : `~${task.estimated_time_minutes} min`}</span><Link className="admin-button" to={`/student/tasks/${task.id}`}>Zobacz zadanie</Link></div>
  </article>;
}
