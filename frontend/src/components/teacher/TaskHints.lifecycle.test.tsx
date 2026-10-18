import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { TaskHint } from "../../api/taskHints";
import { TasksApiError } from "../../api/tasks";
import { hintRequest } from "../../api/taskHints";
import TaskHints from "./TaskHints";

const harness = vi.hoisted(() => ({ drop: (_event: DragEndEvent) => {}, retrySession: vi.fn() }));
vi.mock("../../api/taskHints", () => ({ hintRequest: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: harness.retrySession }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
// Control drop timing here; TaskHints.dnd.test.tsx exercises the real keyboard sensor.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: import("react").ReactNode; onDragEnd: typeof harness.drop }) => {
    harness.drop = onDragEnd; return children;
  },
  KeyboardSensor: class {}, PointerSensor: class {}, closestCenter: vi.fn(), useSensor: vi.fn(), useSensors: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", async importOriginal => ({
  ...await importOriginal<typeof import("@dnd-kit/sortable")>(),
  SortableContext: ({ children }: { children: import("react").ReactNode }) => children,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), setActivatorNodeRef: vi.fn(), transform: null, transition: undefined }),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.mocked(hintRequest).mockReset(); });
const item = (id: number, overrides: Partial<TaskHint> = {}): TaskHint => ({
  id, task_id: 7, position: id, title: `Hint ${id}`, content: `Content ${id}`, created_at: "", updated_at: "", ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const addButton = () => screen.getByRole("button", { name: "Dodaj podpowiedź" }) as HTMLButtonElement;
const row = (title: string) => screen.getByText((text, node) => node?.tagName === "STRONG" && text.endsWith(`· ${title}`)).closest(".editor-hint-row") as HTMLElement;
const names = () => [...document.querySelectorAll(".editor-hint-row strong")].map(node => node.textContent?.split(" · ")[1]);
const positions = () => [...document.querySelectorAll(".editor-hint-row strong")].map(node => node.textContent?.match(/^Podpowiedź (\d+)/)?.[1]);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.submit(screen.getByRole("form"));
function drop(active: number, over: number | null) {
  act(() => harness.drop({ active: { id: active }, over: over === null ? null : { id: over } } as DragEndEvent));
}
async function open(items: TaskHint[] = []) {
  vi.mocked(hintRequest).mockResolvedValue(items);
  const view = render(<TaskHints taskId="7" readOnly={false} />);
  await waitFor(() => expect(addButton().disabled).toBe(false));
  return view;
}

it("optimistically reorders with one PATCH, blocks duplicate drops and restores order on remount", async () => {
  const view = await open([item(1), item(2), item(3)]);
  const pending = deferred<unknown>();
  const sorted = [item(3, { position: 1 }), item(1, { position: 2 }), item(2, { position: 3 })];
  vi.mocked(hintRequest).mockReturnValueOnce(pending.promise).mockResolvedValue(sorted);
  drop(3, 1);
  expect(names()).toEqual(["Hint 3", "Hint 1", "Hint 2"]); expect(positions()).toEqual(["1", "2", "3"]);
  drop(1, 2);
  expect(hintRequest).toHaveBeenCalledTimes(2);
  expect(hintRequest).toHaveBeenLastCalledWith("7", "/reorder", "PATCH", { hint_ids: [3, 1, 2] });
  await act(async () => pending.resolve(sorted));
  await waitFor(() => expect(addButton().disabled).toBe(false));
  view.unmount(); render(<TaskHints taskId="7" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Hint 3", "Hint 1", "Hint 2"]));
  expect(positions()).toEqual(["1", "2", "3"]);
});

it("ignores cancelled drops and drops on the same row", async () => {
  await open([item(1)]); drop(1, null); drop(1, 1);
  expect(hintRequest).toHaveBeenCalledTimes(1); expect(names()).toEqual(["Hint 1"]);
});

it("refetches and rolls back optimistic ordering when reorder fails", async () => {
  await open([item(1), item(2)]);
  const pending = deferred<unknown>();
  vi.mocked(hintRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([item(1), item(2)]);
  drop(2, 1); expect(names()).toEqual(["Hint 2", "Hint 1"]);
  await act(async () => pending.reject(new Error("Reorder failed")));
  await waitFor(() => expect(names()).toEqual(["Hint 1", "Hint 2"]));
  expect(screen.getByRole("alert").textContent).toBe("Reorder failed");
  expect(positions()).toEqual(["1", "2"]); expect(addButton().disabled).toBe(false);
});

it("blocks writes when recovery read fails and retries from the server", async () => {
  await open([item(1), item(2)]);
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(new Error("Still offline"));
  drop(2, 1);
  const retry = await screen.findByRole("button", { name: "Odśwież podpowiedzi" });
  expect(addButton().disabled).toBe(true);
  vi.mocked(hintRequest).mockResolvedValue([item(1), item(2)]);
  fireEvent.click(retry);
  await waitFor(() => expect(addButton().disabled).toBe(false));
  expect(names()).toEqual(["Hint 1", "Hint 2"]); expect(screen.queryByRole("alert")).toBeNull();
});

it("retries initial read failures and disables mutations while loading", async () => {
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Read failed"));
  render(<TaskHints taskId="7" readOnly={false} />);
  expect(addButton().disabled).toBe(true);
  const retry = await screen.findByRole("button", { name: "Odśwież podpowiedzi" });
  expect(screen.getByRole("alert").textContent).toBe("Read failed");
  vi.mocked(hintRequest).mockResolvedValue([item(2, { position: 1 }), item(1, { position: 2 })]);
  fireEvent.click(retry);
  await waitFor(() => expect(names()).toEqual(["Hint 2", "Hint 1"]));
  expect(addButton().disabled).toBe(false);
});

it("prevents duplicate form submissions until mutation and refetch complete", async () => {
  await open(); fireEvent.click(addButton()); change("Tytuł", "New"); change("Treść podpowiedzi", "5");
  const write = deferred<unknown>(); const read = deferred<unknown>();
  vi.mocked(hintRequest).mockReturnValueOnce(write.promise).mockReturnValueOnce(read.promise);
  submit(); submit();
  expect(hintRequest).toHaveBeenCalledTimes(2);
  await act(async () => write.resolve(item(1)));
  expect(addButton().disabled).toBe(true); expect(screen.queryByRole("form")).toBeNull();
  await act(async () => read.resolve([item(1)]));
  expect(addButton().disabled).toBe(false); expect(hintRequest).toHaveBeenCalledTimes(3);
});

it("keeps a failed create editable and allows retry after recovery read", async () => {
  await open(); fireEvent.click(addButton()); change("Tytuł", "New"); change("Treść podpowiedzi", "5");
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Save failed")).mockResolvedValueOnce([]);
  submit(); await screen.findByText("Save failed");
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("New");
  vi.mocked(hintRequest).mockResolvedValueOnce(item(1)).mockResolvedValueOnce([item(1)]);
  submit(); await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
  expect(vi.mocked(hintRequest).mock.calls.filter(call => call[2] === "POST")).toHaveLength(2);
});

it.each([401, 403])("refreshes authentication after HTTP %s", async status => {
  vi.mocked(hintRequest).mockRejectedValueOnce(new TasksApiError("Session", status));
  render(<TaskHints taskId="7" readOnly={false} />);
  await screen.findByRole("alert"); expect(harness.retrySession).toHaveBeenCalledTimes(1);
});

it("blocks a retained form after failed recovery until the list is refreshed", async () => {
  await open(); fireEvent.click(addButton()); change("Tytuł", "New"); change("Treść podpowiedzi", "5");
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Write failed")).mockRejectedValueOnce(new Error("Read failed"));
  submit(); const retry = await screen.findByRole("button", { name: "Odśwież podpowiedzi" });
  expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  submit(); expect(hintRequest).toHaveBeenCalledTimes(3);
  vi.mocked(hintRequest).mockResolvedValue([]); fireEvent.click(retry);
  await waitFor(() => expect(addButton().disabled).toBe(false));
});

it("ignores a late initial read after changing tasks", async () => {
  const old = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(old.promise);
  const view = render(<TaskHints taskId="7" readOnly={false} />);
  vi.mocked(hintRequest).mockResolvedValue([item(8, { title: "New task" })]);
  view.rerender(<TaskHints taskId="8" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["New task"]));
  await act(async () => old.resolve([item(1)])); expect(names()).toEqual(["New task"]);
});

it("keeps the server list after a failed delete and blocks duplicate delete requests", async () => {
  await open([item(1)]); vi.spyOn(window, "confirm").mockReturnValue(true);
  const pending = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([item(1)]);
  const remove = within(row("Hint 1")).getByRole("button", { name: "Usuń" });
  fireEvent.click(remove); fireEvent.click(remove);
  expect(vi.mocked(hintRequest).mock.calls.filter(call => call[2] === "DELETE")).toHaveLength(1);
  await act(async () => pending.reject(new Error("Delete failed")));
  await waitFor(() => expect(addButton().disabled).toBe(false));
  expect(names()).toEqual(["Hint 1"]); expect(screen.getByRole("alert").textContent).toBe("Delete failed");
});

it("recovers the list after failed edit and preserves the draft for correction", async () => {
  await open([item(1)]); fireEvent.click(within(row("Hint 1")).getByRole("button", { name: "Edytuj" }));
  change("Tytuł", "Draft");
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Edit failed")).mockResolvedValueOnce([item(1)]);
  submit(); await screen.findByText("Edit failed");
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect(names()).toEqual(["Hint 1"]); expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("Draft");
});

it.each([401, 403])("refreshes authentication after a mutation returns HTTP %s", async status => {
  await open([item(1)]);
  fireEvent.click(within(row("Hint 1")).getByRole("button", { name: "Edytuj" }));
  change("Treść podpowiedzi", "Draft content");
  vi.mocked(hintRequest).mockRejectedValueOnce(new TasksApiError("Session", status)).mockResolvedValueOnce([item(1)]);
  submit();
  await waitFor(() => expect(harness.retrySession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect(screen.getByRole("alert").textContent).toBe("Session");
  expect((screen.getByLabelText("Treść podpowiedzi") as HTMLTextAreaElement).value).toBe("Draft content");
  expect(names()).toEqual(["Hint 1"]);
});

it("blocks duplicate edits and other mutations until the post-write read finishes", async () => {
  await open([item(1), item(2)]);
  fireEvent.click(within(row("Hint 1")).getByRole("button", { name: "Edytuj" }));
  change("Tytuł", "Edited");
  const write = deferred<unknown>();
  const read = deferred<unknown>();
  vi.mocked(hintRequest).mockReturnValueOnce(write.promise).mockReturnValueOnce(read.promise);
  submit(); submit(); drop(2, 1);
  expect(hintRequest).toHaveBeenCalledTimes(2);
  expect(hintRequest).toHaveBeenLastCalledWith("7", "/1", "PATCH", { title: "Edited", content: "Content 1" });
  await act(async () => write.resolve(item(1, { title: "Edited" })));
  expect(screen.queryByRole("form")).toBeNull();
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  drop(2, 1);
  expect(hintRequest).toHaveBeenCalledTimes(3);
  await act(async () => read.resolve([item(1, { title: "Edited" }), item(2)]));
  expect(addButton().disabled).toBe(false);
  expect(names()).toEqual(["Edited", "Hint 2"]);
});

it("uses server order when a failed reorder was actually committed", async () => {
  await open([item(1), item(2), item(3)]);
  const server = [item(3, { position: 1 }), item(2, { position: 2 }), item(1, { position: 3 })];
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Response lost")).mockResolvedValueOnce(server);
  drop(2, 1);
  await waitFor(() => expect(names()).toEqual(["Hint 3", "Hint 2", "Hint 1"]));
  expect(positions()).toEqual(["1", "2", "3"]);
  expect(screen.getByRole("alert").textContent).toBe("Response lost");
  expect(hintRequest).toHaveBeenLastCalledWith("7");
  expect(addButton().disabled).toBe(false);
});

it("recovers when the write succeeds but its first refetch fails", async () => {
  await open([item(1), item(2)]);
  const server = [item(2, { position: 1 }), item(1, { position: 2 })];
  vi.mocked(hintRequest).mockResolvedValueOnce(server)
    .mockRejectedValueOnce(new Error("Read failed")).mockResolvedValueOnce(server);
  drop(2, 1);
  await waitFor(() => expect(addButton().disabled).toBe(false));
  expect(names()).toEqual(["Hint 2", "Hint 1"]);
  expect(screen.getByRole("alert").textContent).toBe("Read failed");
  expect(vi.mocked(hintRequest).mock.calls.filter(call => call[2] === "PATCH")).toHaveLength(1);
  expect(hintRequest).toHaveBeenCalledTimes(4);
});

it("keeps mutation controls and drops blocked while a manual retry is pending", async () => {
  await open([item(1), item(2)]);
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Write failed")).mockRejectedValueOnce(new Error("Recovery failed"));
  drop(2, 1);
  const retry = await screen.findByRole("button", { name: "Odśwież podpowiedzi" });
  for (const button of screen.getAllByRole("button").filter(button => button !== retry)) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
  }
  drop(1, 2); expect(hintRequest).toHaveBeenCalledTimes(3);
  const pending = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(pending.promise);
  fireEvent.click(retry);
  expect(addButton().disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  drop(1, 2); expect(hintRequest).toHaveBeenCalledTimes(4);
  await act(async () => pending.resolve([item(1), item(2)]));
  expect(names()).toEqual(["Hint 1", "Hint 2"]);
  expect(addButton().disabled).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("aborts the initial read and ignores its late rejection after changing tasks", async () => {
  const pending = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(pending.promise);
  const view = render(<TaskHints taskId="7" readOnly={false} />);
  const signal = vi.mocked(hintRequest).mock.calls[0][4];
  expect(signal?.aborted).toBe(false);
  vi.mocked(hintRequest).mockResolvedValue([item(9, { task_id: 8, position: 1, title: "Current" })]);
  view.rerender(<TaskHints taskId="8" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Current"]));
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.reject(new TasksApiError("Old session error", 401)));
  expect(names()).toEqual(["Current"]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(harness.retrySession).not.toHaveBeenCalled();
  expect(addButton().disabled).toBe(false);
});

it.each([false, true])("ignores a late recovery read failure=%s after changing tasks", async reject => {
  const view = await open([item(1), item(2)]);
  const recovery = deferred<unknown>();
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Old reorder failed")).mockReturnValueOnce(recovery.promise);
  drop(2, 1);
  await waitFor(() => expect(hintRequest).toHaveBeenCalledTimes(3));
  vi.mocked(hintRequest).mockResolvedValue([item(9, { task_id: 8, position: 1, title: "Current" })]);
  view.rerender(<TaskHints taskId="8" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Current"]));
  await act(async () => {
    if (reject) recovery.reject(new Error("Old recovery failed"));
    else recovery.resolve([item(1), item(2)]);
  });
  expect(names()).toEqual(["Current"]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Odśwież podpowiedzi" })).toBeNull();
  expect(addButton().disabled).toBe(false);
});

it("ignores a late post-mutation refetch and keeps the current task editable", async () => {
  const view = await open([item(1), item(2)]);
  const oldRead = deferred<unknown>();
  vi.mocked(hintRequest).mockResolvedValueOnce(undefined).mockReturnValueOnce(oldRead.promise);
  drop(2, 1);
  await waitFor(() => expect(hintRequest).toHaveBeenCalledTimes(3));
  vi.mocked(hintRequest).mockResolvedValue([item(9, { task_id: 8, position: 1, title: "Current" })]);
  view.rerender(<TaskHints taskId="8" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Current"]));
  await act(async () => oldRead.resolve([item(2, { position: 1 }), item(1, { position: 2 })]));
  fireEvent.click(addButton()); change("Tytuł", "New draft");
  expect(names()).toEqual(["Current"]);
  expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("New draft");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("ignores a late mutation rejection after changing tasks", async () => {
  const view = await open([item(1), item(2)]);
  const write = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(write.promise);
  drop(2, 1);
  vi.mocked(hintRequest).mockResolvedValue([item(9, { task_id: 8, position: 1, title: "Current" })]);
  view.rerender(<TaskHints taskId="8" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Current"]));
  await act(async () => write.reject(new TasksApiError("Old mutation failed", 403)));
  expect(names()).toEqual(["Current"]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(harness.retrySession).not.toHaveBeenCalled();
  // The old rejection must not launch recovery against either task.
  expect(hintRequest).toHaveBeenCalledTimes(3);
  expect(addButton().disabled).toBe(false);
});

it("aborts an initial read on unmount and ignores its eventual authentication failure", async () => {
  const pending = deferred<unknown>(); vi.mocked(hintRequest).mockReturnValueOnce(pending.promise);
  const view = render(<TaskHints taskId="7" readOnly={false} />);
  const signal = vi.mocked(hintRequest).mock.calls[0][4];
  view.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => pending.reject(new TasksApiError("Session", 401)));
  expect(harness.retrySession).not.toHaveBeenCalled();
  expect(hintRequest).toHaveBeenCalledTimes(1);
});
