import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { TaskTest } from "../../api/taskTests";
import { TasksApiError } from "../../api/tasks";
import TaskTests from "./TaskTests";
import { testRequest } from "../../api/taskTests";
vi.mock("../../api/taskTests", () => ({ testRequest: vi.fn() }));
const harness = vi.hoisted(() => ({ drop: (_event: DragEndEvent) => {}, retrySession: vi.fn() }));
// Exercise the component's reorder contract independently of jsdom's missing layout.
// Real keyboard sensor wiring is covered separately in TaskTests.dnd.test.tsx.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: import("react").ReactNode; onDragEnd: typeof harness.drop }) => { harness.drop = onDragEnd; return children; },
  KeyboardSensor: class {}, PointerSensor: class {}, closestCenter: vi.fn(), useSensor: vi.fn(), useSensors: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", async importOriginal => ({
  ...await importOriginal<typeof import("@dnd-kit/sortable")>(),
  SortableContext: ({ children }: { children: import("react").ReactNode }) => children,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: undefined }),
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: harness.retrySession }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.mocked(testRequest).mockReset(); });
const item = (id: number, overrides: Partial<TaskTest> = {}): TaskTest => ({ id, task_id: 7, position: id, name: `Test ${id}`, test_type: "INPUT_OUTPUT", config: { input_data: "", expected_output: "5\n" }, is_hidden: false, created_at: "", updated_at: "", ...overrides });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const addButton = () => screen.getByRole("button", { name: "Dodaj przypadek testowy" }) as HTMLButtonElement;
const row = (name: string) => screen.getByText(name, { selector: "strong" }).closest(".editor-test-row") as HTMLElement;
const names = () => [...document.querySelectorAll(".editor-test-row strong")].map(node => node.textContent);
const positions = () => [...document.querySelectorAll(".editor-test-number")].map(node => node.textContent);
async function open(items: TaskTest[] = []) {
  vi.mocked(testRequest).mockResolvedValue(items);
  const view = render(<TaskTests taskId="7" readOnly={false} />);
  await waitFor(() => expect(addButton().disabled).toBe(false));
  return view;
}
function drop(active: number, over: number | null) { act(() => harness.drop({ active: { id: active }, over: over === null ? null : { id: over } } as DragEndEvent)); }
function submit() { fireEvent.submit(screen.getByRole("form")); }
it("validates function JSON and saves parsed arguments and hidden visibility", async () => {
  vi.mocked(testRequest).mockResolvedValue([]);
  render(<TaskTests taskId="7" readOnly={false} />);
  const add = screen.getByRole("button", { name: "Dodaj przypadek testowy" });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  fireEvent.change(screen.getByLabelText("Nazwa testu"), { target: { value: "Area" } });
  fireEvent.change(screen.getByLabelText("Typ testu"), { target: { value: "FUNCTION" } });
  fireEvent.change(screen.getByLabelText("Nazwa funkcji"), { target: { value: "area" } });
  fireEvent.change(screen.getByLabelText("Argumenty (tablica JSON)"), { target: { value: "{}" } });
  fireEvent.change(screen.getByLabelText("Oczekiwany wynik (JSON)"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz test" }));
  expect(screen.getByRole("alert").textContent).toContain("tablicą JSON");
  expect(testRequest).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Argumenty (tablica JSON)"), { target: { value: "[2,3]" } });
  fireEvent.change(screen.getByLabelText("Widoczność"), { target: { value: "true" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz test" }));
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "", "POST", {
    name: "Area", test_type: "FUNCTION", is_hidden: true,
    config: { function_name: "area", arguments: [2, 3], expected_result: 6 },
  }));
});
it("shows archived tests and disables all mutations", async () => {
  vi.mocked(testRequest).mockResolvedValue([{ id: 1, task_id: 7, position: 1, name: "Example", test_type: "STRUCTURAL", config: { rule_type: "USES_FOR" }, is_hidden: false, created_at: "", updated_at: "" }]);
  render(<TaskTests taskId="7" readOnly />);
  await screen.findByText("Example");
  for (const label of ["Dodaj przypadek testowy", "Edytuj", "Usuń", "Przenieś test Example"]) {
    expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
  }
});

it("waits for task creation and never fetches without a task id", () => {
  render(<TaskTests readOnly={false} />);
  expect(addButton().disabled).toBe(true);
  expect(screen.getByText("Zapisz zadanie, aby dodać przypadki testowe.")).toBeTruthy();
  expect(testRequest).not.toHaveBeenCalled();
});

it.each([false, true])("creates INPUT_OUTPUT with empty input, exact output and hidden=%s", async hidden => {
  await open();
  fireEvent.click(addButton());
  change("Nazwa testu", "  Output  ");
  submit();
  expect(screen.getByRole("alert").textContent).toContain("output");
  expect(testRequest).toHaveBeenCalledTimes(1);
  change("Oczekiwany output", " 5\n\n");
  change("Widoczność", String(hidden));
  vi.mocked(testRequest).mockResolvedValueOnce(item(1)).mockResolvedValueOnce([item(1, { name: "Output", is_hidden: hidden })]);
  submit();
  await screen.findByText("Output", { selector: "strong" });
  expect(testRequest).toHaveBeenCalledWith("7", "", "POST", { name: "Output", test_type: "INPUT_OUTPUT", is_hidden: hidden, config: { input_data: "", expected_output: " 5\n\n" } });
  expect(within(row("Output")).getByText(hidden ? "Ukryty" : "Publiczny")).toBeTruthy();
  expect(screen.queryByRole("form")).toBeNull();
});

it.each(["FUNCTION_EXISTS", "CLASS_EXISTS", "CALLS_FUNCTION", "USES_FOR", "USES_WHILE", "USES_IF"])("creates structural rule %s with only applicable fields", async rule => {
  await open();
  fireEvent.click(addButton());
  change("Nazwa testu", "Rule");
  change("Typ testu", "STRUCTURAL");
  change("Typ reguły", rule);
  const needsName = ["FUNCTION_EXISTS", "CLASS_EXISTS", "CALLS_FUNCTION"].includes(rule);
  if (needsName) {
    change("Oczekiwana nazwa", "  "); submit();
    expect(screen.getByRole("alert").textContent).toContain("oczekiwaną nazwę");
    expect(testRequest).toHaveBeenCalledTimes(1);
    change("Oczekiwana nazwa", " print ");
  } else expect(screen.queryByLabelText("Oczekiwana nazwa")).toBeNull();
  submit();
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "", "POST", { name: "Rule", test_type: "STRUCTURAL", is_hidden: false, config: { rule_type: rule, ...(needsName ? { expected_value: "print" } : {}) } }));
});

it("omits stale structural names after switching to a rule without a name", async () => {
  await open(); fireEvent.click(addButton()); change("Nazwa testu", "Loop"); change("Typ testu", "STRUCTURAL");
  change("Oczekiwana nazwa", "old_name"); change("Typ reguły", "USES_FOR"); submit();
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "", "POST", expect.objectContaining({ config: { rule_type: "USES_FOR" } })));
});

it.each([false, true, null])("preserves JSON result %s when editing a function test", async result => {
  await open([item(1, { test_type: "FUNCTION", config: { function_name: "check", arguments: [2, { x: 3 }], expected_result: result }, is_hidden: true })]);
  fireEvent.click(within(row("Test 1")).getByRole("button", { name: "Edytuj" }));
  expect((screen.getByLabelText("Argumenty (tablica JSON)") as HTMLTextAreaElement).value).toBe('[2,{"x":3}]');
  expect((screen.getByLabelText("Oczekiwany wynik (JSON)") as HTMLTextAreaElement).value).toBe(JSON.stringify(result));
  change("Widoczność", "false"); change("Nazwa testu", "Renamed");
  vi.mocked(testRequest).mockResolvedValueOnce(item(1)).mockResolvedValueOnce([item(1, { name: "Renamed" })]);
  submit(); await screen.findByText("Renamed", { selector: "strong" });
  expect(testRequest).toHaveBeenCalledWith("7", "/1", "PATCH", { name: "Renamed", test_type: "FUNCTION", is_hidden: false, config: { function_name: "check", arguments: [2, { x: 3 }], expected_result: result } });
});

it("edits INPUT_OUTPUT and can change its type without sending obsolete config", async () => {
  await open([item(1)]);
  fireEvent.click(within(row("Test 1")).getByRole("button", { name: "Edytuj" }));
  expect((screen.getByLabelText("Oczekiwany output") as HTMLTextAreaElement).value).toBe("5\n");
  change("Typ testu", "STRUCTURAL"); change("Typ reguły", "CALLS_FUNCTION"); change("Oczekiwana nazwa", "print");
  submit();
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "/1", "PATCH", { name: "Test 1", test_type: "STRUCTURAL", is_hidden: false, config: { rule_type: "CALLS_FUNCTION", expected_value: "print" } }));
});

it("prepopulates a structural rule and cancels editing without writing", async () => {
  await open([item(1, { test_type: "STRUCTURAL", config: { rule_type: "CALLS_FUNCTION", expected_value: "len" } })]);
  fireEvent.click(within(row("Test 1")).getByRole("button", { name: "Edytuj" }));
  expect((screen.getByLabelText("Typ reguły") as HTMLSelectElement).value).toBe("CALLS_FUNCTION");
  expect((screen.getByLabelText("Oczekiwana nazwa") as HTMLInputElement).value).toBe("len");
  change("Oczekiwana nazwa", "sum"); fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(screen.queryByRole("form")).toBeNull(); expect(testRequest).toHaveBeenCalledTimes(1);
});

it("validates blank names, blank function names and malformed JSON", async () => {
  await open(); fireEvent.click(addButton()); change("Nazwa testu", " "); submit();
  expect(screen.getByRole("alert").textContent).toContain("nazwę testu");
  change("Nazwa testu", "Fn"); change("Typ testu", "FUNCTION"); change("Nazwa funkcji", " "); submit();
  expect(screen.getByRole("alert").textContent).toContain("nazwę funkcji");
  change("Nazwa funkcji", "f"); change("Argumenty (tablica JSON)", "[1]"); change("Oczekiwany wynik (JSON)", "invalid"); submit();
  expect(screen.getByRole("alert").textContent).toContain("JSON"); expect(testRequest).toHaveBeenCalledTimes(1);
});

it("confirms deletion and displays contiguous positions returned by the server", async () => {
  await open([item(1), item(2), item(3)]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(within(row("Test 2")).getByRole("button", { name: "Usuń" }));
  expect(testRequest).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true);
  vi.mocked(testRequest).mockResolvedValueOnce(undefined).mockResolvedValueOnce([item(1), item(3, { position: 2 })]);
  fireEvent.click(within(row("Test 2")).getByRole("button", { name: "Usuń" }));
  await waitFor(() => expect(names()).toEqual(["Test 1", "Test 3"]));
  expect(positions()).toEqual(["1", "2"]); expect(testRequest).toHaveBeenCalledWith("7", "/2", "DELETE");
});

it("optimistically reorders with one PATCH, blocks duplicate drops and restores order on remount", async () => {
  const view = await open([item(1), item(2), item(3)]);
  const pending = deferred<unknown>();
  const sorted = [item(3, { position: 1 }), item(1, { position: 2 }), item(2, { position: 3 })];
  vi.mocked(testRequest).mockReturnValueOnce(pending.promise).mockResolvedValue(sorted);
  drop(3, 1);
  expect(names()).toEqual(["Test 3", "Test 1", "Test 2"]); expect(positions()).toEqual(["1", "2", "3"]);
  drop(1, 2);
  expect(testRequest).toHaveBeenCalledTimes(2);
  expect(testRequest).toHaveBeenLastCalledWith("7", "/reorder", "PATCH", { test_ids: [3, 1, 2] });
  await act(async () => pending.resolve(sorted));
  await waitFor(() => expect(addButton().disabled).toBe(false));
  view.unmount(); render(<TaskTests taskId="7" readOnly={false} />);
  await waitFor(() => expect(names()).toEqual(["Test 3", "Test 1", "Test 2"]));
  expect(positions()).toEqual(["1", "2", "3"]);
});

it("ignores cancelled drops and drops on the same row", async () => {
  await open([item(1)]); drop(1, null); drop(1, 1);
  expect(testRequest).toHaveBeenCalledTimes(1); expect(names()).toEqual(["Test 1"]);
});

it("refetches and rolls back optimistic ordering when reorder fails", async () => {
  await open([item(1), item(2)]);
  const pending = deferred<unknown>();
  vi.mocked(testRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([item(1), item(2)]);
  drop(2, 1); expect(names()).toEqual(["Test 2", "Test 1"]);
  await act(async () => pending.reject(new Error("Reorder failed")));
  await waitFor(() => expect(names()).toEqual(["Test 1", "Test 2"]));
  expect(screen.getByRole("alert").textContent).toBe("Reorder failed");
  expect(positions()).toEqual(["1", "2"]); expect(addButton().disabled).toBe(false);
});

it("blocks writes when recovery read fails and retries from the server", async () => {
  await open([item(1), item(2)]);
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(new Error("Still offline"));
  drop(2, 1);
  const retry = await screen.findByRole("button", { name: "Odśwież testy" });
  expect(addButton().disabled).toBe(true);
  vi.mocked(testRequest).mockResolvedValue([item(1), item(2)]);
  fireEvent.click(retry);
  await waitFor(() => expect(addButton().disabled).toBe(false));
  expect(names()).toEqual(["Test 1", "Test 2"]); expect(screen.queryByRole("alert")).toBeNull();
});

it("retries initial read failures and disables mutations while loading", async () => {
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Read failed"));
  render(<TaskTests taskId="7" readOnly={false} />);
  expect(addButton().disabled).toBe(true);
  const retry = await screen.findByRole("button", { name: "Odśwież testy" });
  expect(screen.getByRole("alert").textContent).toBe("Read failed");
  vi.mocked(testRequest).mockResolvedValue([item(2, { position: 1 }), item(1, { position: 2 })]);
  fireEvent.click(retry);
  await waitFor(() => expect(names()).toEqual(["Test 2", "Test 1"]));
  expect(addButton().disabled).toBe(false);
});

it("prevents duplicate form submissions until mutation and refetch complete", async () => {
  await open(); fireEvent.click(addButton()); change("Nazwa testu", "New"); change("Oczekiwany output", "5");
  const write = deferred<unknown>(); const read = deferred<unknown>();
  vi.mocked(testRequest).mockReturnValueOnce(write.promise).mockReturnValueOnce(read.promise);
  submit(); submit();
  expect(testRequest).toHaveBeenCalledTimes(2);
  await act(async () => write.resolve(item(1)));
  expect(addButton().disabled).toBe(true); expect(screen.queryByRole("form")).toBeNull();
  await act(async () => read.resolve([item(1)]));
  expect(addButton().disabled).toBe(false); expect(testRequest).toHaveBeenCalledTimes(3);
});

it("keeps a failed create editable and allows retry after recovery read", async () => {
  await open(); fireEvent.click(addButton()); change("Nazwa testu", "New"); change("Oczekiwany output", "5");
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Save failed")).mockResolvedValueOnce([]);
  submit(); await screen.findByText("Save failed");
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect((screen.getByLabelText("Nazwa testu") as HTMLInputElement).value).toBe("New");
  vi.mocked(testRequest).mockResolvedValueOnce(item(1)).mockResolvedValueOnce([item(1)]);
  submit(); await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
  expect(vi.mocked(testRequest).mock.calls.filter(call => call[2] === "POST")).toHaveLength(2);
});

it.each([401, 403])("refreshes authentication after HTTP %s", async status => {
  vi.mocked(testRequest).mockRejectedValueOnce(new TasksApiError("Session", status));
  render(<TaskTests taskId="7" readOnly={false} />);
  await screen.findByRole("alert"); expect(harness.retrySession).toHaveBeenCalledTimes(1);
});

it("blocks a retained form after failed recovery until the list is refreshed", async () => {
  await open(); fireEvent.click(addButton()); change("Nazwa testu", "New"); change("Oczekiwany output", "5");
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Write failed")).mockRejectedValueOnce(new Error("Read failed"));
  submit(); const retry = await screen.findByRole("button", { name: "Odśwież testy" });
  expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  submit(); expect(testRequest).toHaveBeenCalledTimes(3);
  vi.mocked(testRequest).mockResolvedValue([]); fireEvent.click(retry);
  await waitFor(() => expect(addButton().disabled).toBe(false));
});

it("does not overwrite a different task with a late recovery response", async () => {
  const view = await open([item(1), item(2)]);
  const recovery = deferred<unknown>();
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Reorder failed")).mockReturnValueOnce(recovery.promise);
  drop(2, 1);
  await waitFor(() => expect(testRequest).toHaveBeenCalledTimes(3));
  vi.mocked(testRequest).mockResolvedValue([item(9, { name: "Other task", task_id: 8, position: 1 })]);
  view.rerender(<TaskTests taskId="8" readOnly={false} />);
  await screen.findByText("Other task", { selector: "strong" });
  await act(async () => recovery.resolve([item(1), item(2)]));
  expect(names()).toEqual(["Other task"]);
});

it("ignores a late initial read after changing tasks", async () => {
  const old = deferred<unknown>(); vi.mocked(testRequest).mockReturnValueOnce(old.promise);
  const view = render(<TaskTests taskId="7" readOnly={false} />);
  vi.mocked(testRequest).mockResolvedValue([item(8, { name: "New task" })]);
  view.rerender(<TaskTests taskId="8" readOnly={false} />);
  await screen.findByText("New task", { selector: "strong" });
  await act(async () => old.resolve([item(1)])); expect(names()).toEqual(["New task"]);
});

it("keeps the server list after a failed delete and blocks duplicate delete requests", async () => {
  await open([item(1)]); vi.spyOn(window, "confirm").mockReturnValue(true);
  const pending = deferred<unknown>(); vi.mocked(testRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([item(1)]);
  const remove = within(row("Test 1")).getByRole("button", { name: "Usuń" });
  fireEvent.click(remove); fireEvent.click(remove);
  expect(vi.mocked(testRequest).mock.calls.filter(call => call[2] === "DELETE")).toHaveLength(1);
  await act(async () => pending.reject(new Error("Delete failed")));
  await waitFor(() => expect(addButton().disabled).toBe(false));
  expect(names()).toEqual(["Test 1"]); expect(screen.getByRole("alert").textContent).toBe("Delete failed");
});

it("recovers the list after failed edit and preserves the draft for correction", async () => {
  await open([item(1)]); fireEvent.click(within(row("Test 1")).getByRole("button", { name: "Edytuj" }));
  change("Nazwa testu", "Draft");
  vi.mocked(testRequest).mockRejectedValueOnce(new Error("Edit failed")).mockResolvedValueOnce([item(1)]);
  submit(); await screen.findByText("Edit failed");
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect(names()).toEqual(["Test 1"]); expect((screen.getByLabelText("Nazwa testu") as HTMLInputElement).value).toBe("Draft");
});
