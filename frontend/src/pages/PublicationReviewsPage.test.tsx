import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicationReviewsPage from "./PublicationReviewsPage";
import { apiFetch } from "../api/client";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../components/PythonCodeEditor", () => ({ default: (props: { value: string; readOnly: boolean; ariaLabel: string }) =>
  <textarea aria-label={props.ariaLabel} value={props.value} readOnly={props.readOnly} /> }));
const auth = vi.hoisted(() => ({ user: { id: 2, login: "reviewer", role: "TEACHER" } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }) }));
vi.mock("../components/LogoutButton", () => ({ default: () => <button>Wyloguj</button> }));
const task = { id: 7, title: "Częstotliwość słów", author_id: 1, author_login: "autor", topic: "Słowniki", difficulty: "MEDIUM", status: "PENDING_TEACHER_REVIEW", publication_round: 2,
  publication_submitted_at: "2026-11-13T10:00:00Z", is_archived: false, description: "Policz słowa", instructions: "Wypisz słownik", theory: "Użyj get", starter_code: "counts = {}", task_type: "STANDARD", python_version: "3.13", time_limit_seconds: 2, memory_limit_mb: 256, estimated_time_minutes: 20 };
let current = { ...task };
let conflict = false;
beforeEach(() => {
  auth.user.id = 2; current = { ...task }; conflict = false;
  vi.mocked(apiFetch).mockReset().mockImplementation(async (path, options) => {
    if (options?.method === "POST") return Response.json({}, { status: conflict ? 409 : 200 });
    if (path.startsWith("/publication/")) return Response.json({ task: current, author_login: "autor", tests: [{ id: 1, name: "Puste wejście", test_type: "INPUT_OUTPUT", is_hidden: true, config: { input_data: "", expected_output: "{}" } }], hints: [{ id: 1, title: "Kierunek", content: "Zbuduj słownik" }],
      history: [{ id: 1, reviewer_login: "nauczyciel", stage: "TEACHER", publication_round: 1, decision: "CHANGES_REQUESTED", comment: "Dodaj przypadek pusty", created_at: "2026-11-12T10:00:00Z" }] });
    return Response.json({ items: [current], total: 1, limit: 25, offset: 0, metrics: { PENDING_TEACHER_REVIEW: 1, PENDING_ADMIN_REVIEW: 0 } });
  });
});
afterEach(cleanup);
function mount(detail = false, admin = false) {
  const base = admin ? "/admin/reviews" : "/teacher/reviews";
  render(<MemoryRouter initialEntries={[base + (detail ? "/7" : "")]}><Routes>
    <Route path={base} element={<PublicationReviewsPage admin={admin} />} />
    <Route path={`${base}/:taskId`} element={<PublicationReviewsPage admin={admin} />} />
  </Routes></MemoryRouter>);
}
it("loads the teacher queue, filters it and opens the read-only task", async () => {
  mount(); await screen.findByText("Częstotliwość słów");
  fireEvent.change(screen.getByRole("searchbox", { name: "Szukaj zadania" }), { target: { value: "słowa" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.includes("q=s%C5%82owa"))).toBe(true));
  fireEvent.click(await screen.findByRole("link", { name: "Przejrzyj →" }));
  expect(await screen.findByText("Wypisz słownik")).toBeTruthy();
  const editor = await screen.findByLabelText("Kod startowy zadania — tylko do odczytu") as HTMLTextAreaElement;
  expect(editor.value).toBe("counts = {}"); expect(editor.readOnly).toBe(true);
  expect(screen.getByRole("region", { name: "Przypadki testowe" })).toBeTruthy();
  expect(screen.getByText("stdin: (puste) → stdout: {}")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Dodaj przypadek testowy" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edytuj" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Usuń" })).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.includes("/teacher/tasks/7/tests"))).toBe(false);
  expect(screen.getByText("Zbuduj słownik")).toBeTruthy();
  expect(screen.getByText("Dodaj przypadek pusty")).toBeTruthy();
  expect(screen.queryByText(/Weryfikacja rozwiązania referencyjnego — placeholder/)).toBeNull();
  expect(screen.queryByText("Zaliczone")).toBeNull();
});
it("requires a comment for changes and sends the exact publication round", async () => {
  mount(true); await screen.findByText("Wypisz słownik");
  fireEvent.click(screen.getAllByRole("button", { name: "Poproś o poprawki" })[0]);
  expect(screen.getByRole("alert").textContent).toContain("Napisz, co autor");
  expect(vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Komentarz do decyzji"), { target: { value: "Popraw testy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Poproś o poprawki" })[1]);
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body).toBe(JSON.stringify({ publication_round: 2, decision: "CHANGES_REQUESTED", comment: "Popraw testy" })));
  expect(await screen.findByRole("heading", { name: "Recenzje zadań publicznych" })).toBeTruthy();
});
it("accepts as a teacher and returns to the queue", async () => {
  mount(true); await screen.findByText("Wypisz słownik");
  fireEvent.click(screen.getAllByRole("button", { name: "Zatwierdź jako nauczyciel" })[0]);
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([url, options]) => url === "/teacher/publication-reviews/7" && options?.method === "POST")).toBe(true));
  expect(await screen.findByRole("heading", { name: "Recenzje zadań publicznych" })).toBeTruthy();
});
it("hides decision actions from the author", async () => {
  auth.user.id = 1; mount(true); await screen.findByText("Wypisz słownik");
  expect(screen.queryByRole("button", { name: "Zatwierdź jako nauczyciel" })).toBeNull();
  expect(screen.queryByLabelText("Komentarz do decyzji")).toBeNull();
});
it("loads the administrator queue and publishes only through the administrator API", async () => {
  current.status = "PENDING_ADMIN_REVIEW"; mount(false, true);
  await screen.findByRole("link", { name: "Przejrzyj →" });
  expect(screen.queryByRole("button", { name: "Podgląd" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Aktywność" })).toBeNull();
  expect(screen.queryByLabelText("Komentarz do decyzji")).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.startsWith("/publication/tasks/"))).toBe(false);
  fireEvent.click(screen.getByRole("link", { name: "Przejrzyj →" }));
  await screen.findByText("Dodaj przypadek pusty");
  expect((await screen.findByLabelText("Kod startowy zadania — tylko do odczytu") as HTMLTextAreaElement).readOnly).toBe(true);
  expect(screen.getByText("stdin: (puste) → stdout: {}")).toBeTruthy();
  const navigation = screen.getByRole("navigation", { name: "Administracja" });
  expect(navigation.querySelectorAll("a.active")).toHaveLength(1);
  expect(navigation.querySelector("a.active")?.textContent).toBe("Recenzje");
  fireEvent.click(screen.getAllByRole("button", { name: "Zatwierdź publikację" })[0]);
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([url, options]) => url === "/admin/publication-reviews/7" && options?.method === "POST")).toBe(true));
});
it("refreshes stale review details after a conflicting decision", async () => {
  conflict = true; mount(true); await screen.findByText("Wypisz słownik");
  fireEvent.click(screen.getAllByRole("button", { name: "Zatwierdź jako nauczyciel" })[0]);
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(([url]) => url === "/publication/tasks/7").length).toBe(2));
});
