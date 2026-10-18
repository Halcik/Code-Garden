import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable, arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export function useListSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}
export function useSortableRow(id: number, disabled: boolean) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id, disabled });
  return { attributes, listeners, setNodeRef, setActivatorNodeRef, style: { transform: CSS.Transform.toString(transform), transition } };
}
export function reorderList<T extends { id: number; position: number }>(items: T[], event: DragEndEvent): T[] | null {
  const from = items.findIndex(item => item.id === event.active.id);
  const to = items.findIndex(item => item.id === event.over?.id);
  if (from < 0 || to < 0 || from === to) return null;
  return arrayMove(items, from, to).map((item, i) => ({ ...item, position: i + 1 }));
}
