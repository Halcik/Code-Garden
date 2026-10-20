import { DIFFICULTIES, TASK_TYPES } from "../api/tasks";
import type { StudentTask } from "../api/studentTasks";

export default function TaskBadges({ task }: { task: Pick<StudentTask, "topic" | "difficulty" | "task_type"> }) {
  return <div className="student-chips"><span aria-label={`Kategoria zadania: ${task.topic}`} title="Kategoria zadania">{task.topic}</span><span>{DIFFICULTIES[task.difficulty]}</span><span>{TASK_TYPES[task.task_type]}</span></div>;
}
