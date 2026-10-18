import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TaskHints from "./TaskHints";
import { hintRequest } from "../../api/taskHints";
import type { TaskHint } from "../../api/taskHints";
vi.mock("../../api/taskHints", () => ({ hintRequest: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: vi.fn() }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(hintRequest).mockReset(); });
const item = (id: number): TaskHint => ({ id, task_id: 7, position: id, title: `Hint ${id}`, content: `Content ${id}`, created_at: "", updated_at: "" });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function open(items: TaskHint[] = []) {
  vi.mocked(hintRequest).mockResolvedValue(items);
  render(<TaskHints taskId="7" readOnly={false} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Dodaj podpowiedź" }) as HTMLButtonElement).disabled).toBe(false));
}
it("rejects whitespace and creates a hint with trimmed fields", async () => {
  await open(); fireEvent.click(screen.getByRole("button", { name: "Dodaj podpowiedź" }));
  change("Tytuł", " "); change("Treść podpowiedzi", " "); fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(hintRequest).toHaveBeenCalledTimes(1);
  change("Tytuł", " Direction "); change("Treść podpowiedzi", " Think ");
  vi.mocked(hintRequest).mockResolvedValueOnce(item(1)).mockResolvedValueOnce([item(1)]);
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("Podpowiedź 1 · Hint 1");
  expect(hintRequest).toHaveBeenCalledWith("7", "", "POST", { title: "Direction", content: "Think" });
});
it("edits content without losing order and confirms deletion", async () => {
  await open([item(1), item(2)]);
  const row = screen.getByText("Podpowiedź 2 · Hint 2").closest(".editor-hint-row") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Edytuj" }));
  expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("Hint 2");
  change("Treść podpowiedzi", "Changed"); fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
  expect(hintRequest).toHaveBeenCalledWith("7", "/2", "PATCH", { title: "Hint 2", content: "Changed" });
  vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(within(row).getByRole("button", { name: "Usuń" }));
  expect(vi.mocked(hintRequest).mock.calls.filter(call => call[2] === "DELETE")).toHaveLength(0);
  vi.mocked(window.confirm).mockReturnValue(true);
  vi.mocked(hintRequest).mockResolvedValueOnce(undefined).mockResolvedValueOnce([item(1)]);
  fireEvent.click(within(row).getByRole("button", { name: "Usuń" }));
  await waitFor(() => expect(screen.queryByText("Podpowiedź 2 · Hint 2")).toBeNull());
  expect(hintRequest).toHaveBeenCalledWith("7", "/2", "DELETE");
});
it("disables all mutations for an archived task", async () => {
  vi.mocked(hintRequest).mockResolvedValue([item(1)]);
  render(<TaskHints taskId="7" readOnly />); await screen.findByText("Content 1");
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
});
it("keeps the draft and restores server data after a failed save", async () => {
  await open([item(1)]); fireEvent.click(screen.getByRole("button", { name: "Edytuj" }));
  change("Tytuł", "Draft");
  vi.mocked(hintRequest).mockRejectedValueOnce(new Error("Save failed")).mockResolvedValueOnce([item(1)]);
  fireEvent.submit(screen.getByRole("form")); await screen.findByText("Save failed");
  await waitFor(() => expect((screen.getByRole("form").querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));
  expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("Draft");
  expect(screen.getByText("Podpowiedź 1 · Hint 1")).toBeTruthy();
});
