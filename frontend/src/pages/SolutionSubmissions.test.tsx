import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentTaskPage from "./StudentTaskPage";
import { apiFetch } from "../api/client";
import type { SolutionDraft } from "../api/solutions";
import type { ReviewStatus } from "../api/reviews";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../components/PythonCodeEditor", () => ({ default: (p: { value: string; onChange: (v: string) => void }) => <textarea aria-label="Editor" value={p.value} onChange={e => p.onChange(e.target.value)} /> }));

const check = { passed: 1, total: 2, all_passed: false, results: [
  { number: 1, position: 1, test_type: "INPUT_OUTPUT", is_public: false, status: "passed" },
  { number: 2, position: 2, test_type: "INPUT_OUTPUT", is_public: false, status: "failed" },
] };
let draft: SolutionDraft;
let revealed: { number: number; title: string; content: string }[];
let version: number;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
async function server(path: string, options?: RequestInit) {
  if (path.endsWith("/draft")) {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      draft = { ...draft, source_code: body.source_code, revision: draft.revision + 1 };
    }
    return Response.json(draft);
  }
  if (path.endsWith("/hints")) return Response.json({ total: 2, revealed });
  if (path.endsWith("/reveal")) {
    const hint = { number: revealed.length + 1, title: "Kierunek", content: "Zacznij od warunku." };
    revealed.push(hint); return Response.json(hint);
  }
  if (path.endsWith("/check")) return Response.json(check);
  if (path.endsWith("/submissions")) {
    const submission = { id: ++version, version, submitted_at: "2026-10-30T11:15:00Z", passed_tests: 1, failed_tests: 1, total_tests: 2, all_passed: false };
    draft = { ...draft, last_check: check as SolutionDraft["last_check"], check_is_current: true, latest_submission: submission };
    return Response.json({ submission, draft }, { status: 201 });
  }
  return Response.json({ id: 7, title: "Zadanie", description: "Opis", topic: "Python", difficulty: "EASY", task_type: "STANDARD", starter_code: "starter", theory: null, instructions: null });
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  vi.mocked(apiFetch).mockReset().mockImplementation(server);
  draft = { source_code: "saved draft", revision: 0, last_check: null, checked_hash: null, checked_at: null, check_is_current: false, latest_submission: null };
  revealed = []; version = 0;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function mount() {
  render(<MemoryRouter initialEntries={["/student/tasks/7"]}><Routes><Route path="/student/tasks/:taskId" element={<StudentTaskPage />} /></Routes></MemoryRouter>);
  return await screen.findByLabelText("Editor") as HTMLTextAreaElement;
}
const saves = () => vi.mocked(apiFetch).mock.calls.filter(([p, o]) => p.endsWith("/draft") && o?.method === "PUT");
const submissions = () => vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith("/submissions"));

it.each([
  ["PENDING", "Oczekuje na ocenę"], ["ACCEPTED", "Zaakceptowane"], ["CHANGES_REQUESTED", "Wymaga poprawy"],
] as const)("shows automatic results separately from teacher status %s", async (status: ReviewStatus, label) => {
  draft.latest_submission = { id: 3, version: 2, submitted_at: "2026-11-03T12:00:00Z", passed_tests: 1, failed_tests: 1, total_tests: 2, all_passed: false,
    review: { status, feedback: "", reviewed_at: null } };
  draft.latest_feedback = { version: 1, status: "CHANGES_REQUESTED", feedback: "Sprawdź pętlę.", reviewed_at: "2026-11-02T12:00:00Z" };
  await mount();
  expect((await screen.findByLabelText("Weryfikacja nauczyciela")).dataset.version).toBe("2");
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByText(/Ostatnio wysłano: wersja 2/).textContent).toContain("1/2 testów");
  expect(screen.getByRole("heading", { name: "Komentarz nauczyciela" })).toBeTruthy();
  expect(screen.getByLabelText("Komentarz nauczyciela").closest(".student-task-materials")).toBeTruthy();
  expect(screen.getByLabelText("Weryfikacja nauczyciela").closest(".solution-check-card")).toBeTruthy();
  expect(screen.getByLabelText("Komentarz nauczyciela").textContent).toContain("Wersja 1");
  expect(screen.getByText("Sprawdź pętlę.")).toBeTruthy();
  expect(screen.queryByText(/Prywatna notatka/)).toBeNull();
});

it("resets review to pending after a new submission while retaining correctly labeled old feedback", async () => {
  version = 1;
  draft.latest_submission = { id: 1, version: 1, submitted_at: "2026-11-03T12:00:00Z", passed_tests: 1, failed_tests: 1, total_tests: 2, all_passed: false,
    review: { status: "ACCEPTED", feedback: "Pierwsza uwaga.", reviewed_at: null } };
  draft.latest_feedback = { version: 1, status: "ACCEPTED", feedback: "Pierwsza uwaga.", reviewed_at: null };
  const editor = await mount();
  expect(await screen.findByText("Zaakceptowane")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Wyślij rozwiązanie" }));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź wysłanie" }));
  expect(await screen.findByText("Oczekuje na ocenę")).toBeTruthy();
  expect(screen.getByLabelText("Weryfikacja nauczyciela").dataset.version).toBe("2");
  expect(screen.getByLabelText("Komentarz nauczyciela").textContent).toContain("Wersja 1");
  expect(screen.getByLabelText("Komentarz nauczyciela").textContent).not.toContain("Wersja 2");
  expect(editor.readOnly).toBe(false);
});

it("refreshes teacher feedback from the autosave response without replacing the student's code", async () => {
  draft.latest_submission = { id: 1, version: 1, submitted_at: "2026-11-03T12:00:00Z", passed_tests: 1, failed_tests: 1, total_tests: 2, all_passed: false,
    review: { status: "PENDING", feedback: "", reviewed_at: null } };
  const editor = await mount();
  await screen.findByText("Oczekuje na ocenę");
  draft = { ...draft, latest_submission: { ...draft.latest_submission!, review: { status: "CHANGES_REQUESTED", feedback: "Nowy feedback.", reviewed_at: null } },
    latest_feedback: { version: 1, status: "CHANGES_REQUESTED", feedback: "Nowy feedback.", reviewed_at: null } };
  fireEvent.change(editor, { target: { value: "my newer code" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz wersję roboczą" }));
  expect(await screen.findByText("Wymaga poprawy")).toBeTruthy();
  expect(screen.getByText("Nowy feedback.")).toBeTruthy();
  expect(editor.value).toBe("my newer code");
});

it("loads the server draft into Monaco, including a server initialized starter", async () => {
  expect((await mount()).value).toBe("saved draft");
  cleanup(); draft.source_code = "starter";
  expect((await mount()).value).toBe("starter");
});

it("debounces typing, reports saving and saved, and serializes newer edits without replacing editor code", async () => {
  const editor = await mount();
  vi.useFakeTimers();
  const pending = deferred();
  vi.mocked(apiFetch).mockImplementation((p, o) => p.endsWith("/draft") && o?.method === "PUT" && saves().length === 1 ? pending.promise : server(p, o));
  fireEvent.change(editor, { target: { value: "A" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  fireEvent.change(editor, { target: { value: "AB" } });
  expect(saves()).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(749); });
  expect(saves()).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(saves()).toHaveLength(1);
  expect(screen.queryByText("Zapisywanie…")).toBeNull();
  fireEvent.change(editor, { target: { value: "ABC" } });
  await act(async () => { pending.resolve(Response.json({ ...draft, source_code: "AB", revision: 1 })); });
  expect(editor.value).toBe("ABC");
  expect(saves()).toHaveLength(2);
  expect(JSON.parse(String(saves()[1][1]?.body))).toEqual({ source_code: "ABC", revision: 1 });
  expect(screen.queryByText("Zapisano")).toBeNull();
});

it("retains unsaved code after an autosave failure and supports retry", async () => {
  const editor = await mount();
  vi.useFakeTimers();
  vi.mocked(apiFetch).mockImplementation((p, o) => p.endsWith("/draft") && o?.method === "PUT" ? Promise.resolve(new Response(null, { status: 500 })) : server(p, o));
  fireEvent.change(editor, { target: { value: "my work" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(screen.getByText(/Nie udało się zapisać/)).toBeTruthy();
  expect(editor.value).toBe("my work");
  vi.mocked(apiFetch).mockImplementation(server);
  fireEvent.click(screen.getByRole("button", { name: "Zapisz wersję roboczą" }));
  await act(async () => {});
  expect(screen.queryByText("Zapisano")).toBeNull();
});

it("restores revealed hints after refresh and records only explicit reveals", async () => {
  await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  await screen.findByText("Zacznij od warunku.");
  expect(vi.mocked(apiFetch).mock.calls.filter(([p, o]) => p.endsWith("/reveal") && o?.method === "POST")).toHaveLength(1);
  cleanup(); await mount();
  expect(await screen.findByText("Wykorzystane podpowiedzi: 1 z 2")).toBeTruthy();
  expect(screen.getByText("Zacznij od warunku.")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith("/reveal"))).toHaveLength(1);
});

it("shows the current check result and marks it stale on the next edit", async () => {
  const editor = await mount();
  fireEvent.click(screen.getByRole("button", { name: "Sprawdź rozwiązanie" }));
  await screen.findByLabelText("1 / 2 testów zaliczonych");
  expect(screen.queryByText("Kod został zmieniony od ostatniego sprawdzenia.")).toBeNull();
  fireEvent.change(editor, { target: { value: "changed" } });
  expect(screen.getByText("Kod został zmieniony od ostatniego sprawdzenia.")).toBeTruthy();
});

it.each([false, true])("confirms retesting, blocks double submit and preserves work (all passed: %s)", async allPassed => {
  revealed = [{ number: 1, title: "Kierunek", content: "Zacznij od warunku." }];
  const editor = await mount();
  fireEvent.change(editor, { target: { value: "submitted code" } });
  fireEvent.click(screen.getByRole("button", { name: "Wyślij rozwiązanie" }));
  expect(screen.getByRole("dialog").textContent).toContain("Kod zostanie ponownie sprawdzony na testach.");
  expect(submissions()).toHaveLength(0);
  const pending = deferred();
  vi.mocked(apiFetch).mockImplementation((p, o) => p.endsWith("/submissions") ? pending.promise : server(p, o));
  const confirm = screen.getByRole("button", { name: "Potwierdź wysłanie" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(submissions()).toHaveLength(1));
  expect((screen.getByRole("button", { name: "Wysyłanie…" }) as HTMLButtonElement).disabled).toBe(true);
  const value = await (await server("/student/tasks/7/submissions")).json();
  if (allPassed) {
    value.submission.passed_tests = 2; value.submission.failed_tests = 0; value.submission.all_passed = true;
    value.draft.last_check = { ...check, passed: 2, all_passed: true, results: check.results.map(r => ({ ...r, status: "passed" })) };
  }
  await act(async () => { pending.resolve(Response.json(value)); });
  expect(await screen.findByText(/Rozwiązanie zostało wysłane jako wersja 1/)).toBeTruthy();
  expect(screen.getByText(/Ostatnio wysłano: wersja 1/).textContent).toContain(`${allPassed ? 2 : 1}/2 testów`);
  expect(editor.value).toBe("submitted code");
  expect(screen.getByText("Zacznij od warunku.")).toBeTruthy();
  expect(screen.queryByText("Kod został zmieniony od ostatniego sprawdzenia.")).toBeNull();
  fireEvent.change(editor, { target: { value: "next draft" } });
  expect(editor.value).toBe("next draft");
  expect(screen.getByText("Kod został zmieniony od ostatniego sprawdzenia.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zapisz wersję roboczą" }));
  await waitFor(() => expect(draft.source_code).toBe("next draft"));
  expect(screen.getByText("Kod został zmieniony od ostatniego sprawdzenia.")).toBeTruthy();
  expect(screen.getByText(/Ostatnio wysłano: wersja 1/)).toBeTruthy();
});

it.each([502, 503, 504])("reports infrastructure HTTP %s without showing a successful submission and allows retry", async status => {
  const editor = await mount();
  vi.mocked(apiFetch).mockImplementation((p, o) => p.endsWith("/submissions") ? Promise.resolve(new Response(null, { status })) : server(p, o));
  fireEvent.click(screen.getByRole("button", { name: "Wyślij rozwiązanie" }));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź wysłanie" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Spróbuj ponownie");
  expect(screen.queryByText(/Ostatnio wysłano/)).toBeNull();
  expect(editor.value).toBe("saved draft");
  expect((screen.getByRole("button", { name: "Wyślij rozwiązanie" }) as HTMLButtonElement).disabled).toBe(false);
});
