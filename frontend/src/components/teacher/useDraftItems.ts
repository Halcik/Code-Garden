import { useRef } from "react";

type DraftItem = { id: number; position: number; task_id: number; created_at: string; updated_at: string };

// Negative IDs are local only; the create request sends content in list order.
export function useDraftItems<T extends DraftItem>(items: T[], change: (items: T[]) => void) {
  const nextId = useRef(-1);
  return {
    save(data: Omit<T, keyof DraftItem>, existing?: T | null) {
      if (existing) change(items.map(item => item.id === existing.id ? { ...item, ...data } : item));
      else change([...items, { ...data, id: nextId.current--, position: items.length + 1, task_id: 0, created_at: "", updated_at: "" } as T]);
    },
    remove(id: number) {
      change(items.filter(item => item.id !== id).map((item, index) => ({ ...item, position: index + 1 })));
    },
  };
}
