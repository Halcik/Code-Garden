import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeacherSubmissionQueuePage from "./TeacherSubmissionQueuePage";
import { TeacherLayout } from "./TeacherTasksPage";
import { apiFetch } from "../api/client";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "dark", preference: "dark", setPreference: vi.fn() }) }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { login: "teacher" } }) }));
vi.mock("../components/LogoutButton", () => ({ default: () => null }));
const row = { student: { id: 3, login: "Anna", status: "ACTIVE" }, task: { id: 7, title: "Pętle", topic: "Python" },
  submission_count: 2, used_hint_count: 1, latest_submission: { id: 10, version: 2, submitted_at: "2026-11-03T10:00:00Z", passed_tests: 4, failed_tests: 1, total_tests: 5, all_passed: false } };
let empty = false;
beforeEach(() => {
  empty = false;
  vi.mocked(apiFetch).mockReset().mockImplementation(async path => Response.json({
    items: empty ? [] : [row], total: empty ? 0 : 26, limit: 25,
    offset: Number(new URL(path, "http://local").searchParams.get("offset") || 0), tasks: [row.task] }));
});
afterEach(cleanup);

it("shows review totals across tabs and hides zero counts", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => Response.json({
    items: [row], total: path.includes("review_status=ACCEPTED") ? 20 : 7, limit: 25, offset: 0, tasks: [row.task],
    review_counts: { ALL: 27, PENDING: 7, ACCEPTED: 20, CHANGES_REQUESTED: 0 },
  }));
  mount(); await screen.findByText("Anna");
  const tabs = screen.getByRole("group", { name: "Kolejki prac uczniów" });
  expect(screen.getByRole("button", { name: "Do przejrzenia 7" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Wszystkie 27" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Do poprawy" }).querySelector(".teacher-tab-count")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Zaakceptowane 20" }));
  expect(await screen.findByRole("button", { name: "Do przejrzenia 7" })).toBeTruthy();
  expect(tabs.querySelectorAll(".teacher-tab-count")).toHaveLength(3);
});

it("switches between unclaimed work and my reviews using server filters", async () => {
  mount(); await screen.findByText("Anna");
  expect(screen.queryByRole("group", { name: "Opiekun recenzji" })).toBeNull();
  expect(screen.getByRole("group", { name: "Kolejki prac uczniów" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Opiekun recenzji"), { target: { value: "available" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("scope=available"));
  fireEvent.change(screen.getByLabelText("Opiekun recenzji"), { target: { value: "mine" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("scope=mine"));
});
function mount() {
  render(<MemoryRouter initialEntries={["/teacher/submissions"]}><Routes><Route path="/teacher" element={<TeacherLayout />}>
    <Route path="submissions" element={<TeacherSubmissionQueuePage />} />
    <Route path="submissions/tasks/:taskId/students/:studentId" element={<p>Szczegóły pracy</p>} />
  </Route></Routes></MemoryRouter>);
}
it("opens a dedicated sidebar tab and queue across tasks, then opens a student's work", async () => {
  mount();
  expect(await screen.findByText("Anna")).toBeTruthy();
  const navigation = screen.getByRole("link", { name: "Prace uczniów" });
  expect(navigation.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Zadania" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("heading", { name: "Kolejka oceniania" })).toBeTruthy();
  expect(screen.getByText("4 / 5 testów")).toBeTruthy();
  expect(screen.getByText("2 wersji")).toBeTruthy();
  expect(screen.getByText("1 wykorzystanych podpowiedzi")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Zobacz rozwiązanie →" }));
  expect(await screen.findByText("Szczegóły pracy")).toBeTruthy();
  expect(navigation.getAttribute("aria-current")).toBe("page");
});
it("filters and sorts on the server and resets pagination when filters change", async () => {
  mount(); await screen.findByText("Anna");
  fireEvent.click(screen.getByRole("button", { name: "Następna" }));
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("offset=25"));
  await screen.findByText("Anna");
  fireEvent.change(screen.getByLabelText("Zadanie"), { target: { value: "7" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("task_id=7"));
  expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("offset=0");
  fireEvent.change(screen.getByLabelText("Sortowanie"), { target: { value: "oldest" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("sort=oldest"));
  fireEvent.change(screen.getByLabelText("Szukaj ucznia lub zadania"), { target: { value: "Anna" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("q=Anna"));
});
it("shows an empty queue and does not invent review statistics", async () => {
  empty = true; mount();
  expect(await screen.findByText("Żaden uczeń nie wysłał jeszcze rozwiązania Twoich zadań.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zaakceptowane" }));
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("review_status=ACCEPTED"));
  fireEvent.click(screen.getByRole("button", { name: "Do poprawy" }));
  await waitFor(() => expect(vi.mocked(apiFetch).mock.lastCall?.[0]).toContain("review_status=CHANGES_REQUESTED"));
  expect(screen.queryByText("Dostępne po włączeniu oceniania")).toBeNull();
});
it("shows request errors and retries", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}, { status: 403 }));
  mount(); expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByText("Anna")).toBeTruthy();
});
