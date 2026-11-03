import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import TeacherSubmissionsPage from "./TeacherSubmissionsPage";
import { apiFetch } from "../api/client";
import type { Review } from "../api/reviews";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../components/PythonCodeEditor", () => ({ default: (p: { value: string }) => <textarea aria-label="Kod" readOnly value={p.value} /> }));
const student = { id: 3, login: "Anna", status: "ACTIVE" };
const versions = [2, 1].map(version => ({ id: version + 10, version, submitted_at: "2026-11-03T12:00:00Z", passed_tests: 1, failed_tests: 1, total_tests: 2, all_passed: false }));
let reviews: Record<number, Review>;
let note: string;
async function server(path: string, options?: RequestInit): Promise<Response> {
  if (path.endsWith("/note")) {
    if (options?.method === "PUT") note = JSON.parse(String(options.body)).content;
    return Response.json({ student_id: 3, content: note, updated_at: null });
  }
  if (path.endsWith("/review")) {
    const id = Number(path.split("/").at(-2));
    const body = JSON.parse(String(options?.body));
    reviews[id] = { status: body.decision, feedback: body.feedback, reviewed_at: "2026-11-03T13:00:00Z" };
    return Response.json(reviews[id]);
  }
  if (path.includes("/students/")) return Response.json({ student, items: versions.map(v => ({ ...v, review: reviews[v.id] })) });
  if (path.startsWith("/teacher/submissions/")) {
    const id = Number(path.split("/").at(-1));
    return Response.json({ ...versions.find(v => v.id === id), task_id: currentTask(), student,
      source_code: "print(1)", test_results: [], used_hints: [], total_hints: 3, review: reviews[id] });
  }
  return Response.json({ id: currentTask(), title: "Zadanie", description: "", instructions: "Polecenie" });
}
let taskId: number;
const currentTask = () => taskId;
beforeEach(() => {
  reviews = {}; note = "Zapamiętana uwaga"; taskId = 7;
  vi.mocked(apiFetch).mockReset().mockImplementation(server);
});
afterEach(cleanup);
function mount() {
  render(<MemoryRouter initialEntries={["/teacher/tasks/7/students/3/submissions"]}>
    <Link to="/teacher/tasks/8/students/3/submissions" onClick={() => { taskId = 8; }}>Drugie zadanie</Link>
    <Routes><Route path="/teacher/tasks/:taskId/students/:studentId/submissions" element={<TeacherSubmissionsPage />} /></Routes>
  </MemoryRouter>);
}
const feedbackInput = () => screen.getByLabelText("Feedback dla ucznia") as HTMLTextAreaElement;
const noteInput = () => screen.getByLabelText("Twoja notatka") as HTMLTextAreaElement;

it("loads pending state, validates feedback for changes, saves and changes a review", async () => {
  mount(); await screen.findByLabelText("Feedback dla ucznia");
  expect(screen.getAllByText("Oczekuje na sprawdzenie").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Odeślij rozwiązanie .* do poprawy/ }));
  expect(await screen.findByText("Napisz, co uczeń powinien poprawić.")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith("/review"))).toHaveLength(0);
  fireEvent.change(feedbackInput(), { target: { value: "Popraw pętlę" } });
  fireEvent.click(screen.getByRole("button", { name: /Odeślij rozwiązanie .* do poprawy/ }));
  expect(await screen.findByText("Zapisano weryfikację wersji 2.")).toBeTruthy();
  expect(reviews[12].status).toBe("CHANGES_REQUESTED");
  expect(reviews[12].feedback).toBe("Popraw pętlę");
  fireEvent.click(screen.getByRole("button", { name: /Zaakceptuj rozwiązanie/ }));
  await waitFor(() => expect(reviews[12].status).toBe("ACCEPTED"));
  expect(screen.getAllByText("Zaakceptowane").length).toBeGreaterThan(0);
});
it("loads saved review per version and restores it after switching back", async () => {
  reviews[12] = { status: "CHANGES_REQUESTED", feedback: "Do poprawy", reviewed_at: null };
  mount(); await screen.findByLabelText("Feedback dla ucznia");
  expect(feedbackInput().value).toBe("Do poprawy");
  expect(screen.getAllByText("Wymaga poprawy").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Wersja 1/ }));
  await waitFor(() => expect(feedbackInput().value).toBe(""));
  fireEvent.click(screen.getByRole("button", { name: /Wersja 2/ }));
  await waitFor(() => expect(feedbackInput().value).toBe("Do poprawy"));
});
it("saves notes independently and preserves them across versions and tasks", async () => {
  mount(); await waitFor(() => expect(noteInput().value).toBe("Zapamiętana uwaga"));
  expect(screen.getByText("Widoczna tylko dla Ciebie. Dotyczy ucznia we wszystkich zadaniach.")).toBeTruthy();
  fireEvent.change(noteInput(), { target: { value: "Nowa prywatna notatka" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz notatkę" }));
  await screen.findByText("Notatka zapisana.");
  expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith("/review"))).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /Wersja 1/ }));
  await screen.findByRole("button", { name: /Zaakceptuj rozwiązanie/ });
  expect(noteInput().value).toBe("Nowa prywatna notatka");
  fireEvent.click(screen.getByRole("link", { name: "Drugie zadanie" }));
  await waitFor(() => expect(noteInput().value).toBe("Nowa prywatna notatka"));
  expect(vi.mocked(apiFetch).mock.calls.filter(([p, options]) => p.endsWith("/note") && options?.method === "PUT")).toHaveLength(1);
});
it("shows save progress, blocks double review submission and retains feedback after an error", async () => {
  mount(); await screen.findByLabelText("Feedback dla ucznia");
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  vi.mocked(apiFetch).mockImplementation((path, options) => path.endsWith("/review") ? pending : server(path, options));
  fireEvent.change(feedbackInput(), { target: { value: "Ważna uwaga" } });
  const save = screen.getByRole("button", { name: /Zaakceptuj rozwiązanie/ });
  fireEvent.click(save); fireEvent.click(save);
  expect((screen.getByRole("button", { name: "Zapisywanie…" }) as HTMLButtonElement).disabled).toBe(true);
  expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith("/review"))).toHaveLength(1);
  await act(async () => resolve(Response.json({}, { status: 500 })));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(feedbackInput().value).toBe("Ważna uwaga");
  vi.mocked(apiFetch).mockImplementation(server);
  fireEvent.click(screen.getByRole("button", { name: /Zaakceptuj rozwiązanie/ }));
  expect(await screen.findByText("Zapisano weryfikację wersji 2.")).toBeTruthy();
});
it("handles note load failure without overwriting a note and allows retry", async () => {
  vi.mocked(apiFetch).mockImplementation((path, options) => path.endsWith("/note") ? Promise.resolve(Response.json({}, { status: 500 })) : server(path, options));
  mount(); await screen.findByRole("button", { name: "Wczytaj notatkę ponownie" });
  expect(noteInput().disabled).toBe(true);
  vi.mocked(apiFetch).mockImplementation(server);
  fireEvent.click(screen.getByRole("button", { name: "Wczytaj notatkę ponownie" }));
  await waitFor(() => expect(noteInput().value).toBe("Zapamiętana uwaga"));
});
