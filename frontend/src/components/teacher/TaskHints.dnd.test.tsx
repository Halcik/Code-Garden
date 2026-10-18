import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskHints from "./TaskHints";
import { hintRequest } from "../../api/taskHints";
import type { TaskHint } from "../../api/taskHints";
vi.mock("../../api/taskHints", () => ({ hintRequest: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: vi.fn() }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(hintRequest).mockReset(); });

it("sorts through the real keyboard sensor only from the grip and saves one reorder", async () => {
  // jsdom supplies no layout. Give the real dnd-kit collision detector two rows.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest(".editor-hint-row");
    const index = row ? [...row.parentElement!.children].indexOf(row) : 0;
    const top = index * 100;
    return { x: 0, y: top, top, bottom: top + 80, left: 0, right: 500, width: 500, height: 80, toJSON: () => ({}) };
  });
  const items: TaskHint[] = [1, 2].map(id => ({ id, task_id: 7, position: id, title: `Hint ${id}`, content: "Think", created_at: "", updated_at: "" }));
  vi.mocked(hintRequest).mockResolvedValue(items);
  render(<TaskHints taskId="7" readOnly={false} />);
  const grip = await screen.findByRole("button", { name: "Przenieś podpowiedź Hint 1" });
  fireEvent.keyDown(screen.getByText("Podpowiedź 1 · Hint 1", { selector: "strong" }), { code: "Space" });
  expect(grip.getAttribute("aria-pressed")).not.toBe("true");
  grip.focus(); fireEvent.keyDown(grip, { code: "Space" });
  await waitFor(() => expect(grip.getAttribute("aria-pressed")).toBe("true"));
  // KeyboardSensor attaches its document listeners after activation.
  await new Promise(resolve => setTimeout(resolve, 0));
  fireEvent.keyDown(document, { code: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("over droppable area 2"));
  vi.mocked(hintRequest).mockResolvedValueOnce(undefined).mockResolvedValue([items[1], items[0]].map((item, index) => ({ ...item, position: index + 1 })));
  fireEvent.keyDown(document, { code: "Space" });
  await waitFor(() => expect(hintRequest).toHaveBeenCalledWith("7", "/reorder", "PATCH", { hint_ids: [2, 1] }));
  expect(vi.mocked(hintRequest).mock.calls.filter(call => call[2] === "PATCH")).toHaveLength(1);
  await waitFor(() => expect([...document.querySelectorAll(".editor-hint-row strong")].map(node => node.textContent)).toEqual(["Podpowiedź 1 · Hint 2", "Podpowiedź 2 · Hint 1"]));
});
