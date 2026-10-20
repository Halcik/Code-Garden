import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "../api/client";
import StudentTasksPage, { StudentTaskPlaceholder } from "./StudentTasksPage";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const retrySession = vi.fn();
const task = { id: 7, title: "Suma liczb", description: "Oblicz sumę", topic: "Listy", difficulty: "EASY", task_type: "STANDARD", estimated_time_minutes: 15 };
function mount() { return render(<MemoryRouter initialEntries={["/student/tasks"]}><Routes><Route path="/student/tasks" element={<StudentTasksPage />} /><Route path="/student/tasks/:taskId" element={<StudentTaskPlaceholder />} /></Routes></MemoryRouter>); }
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("uses the student API and routes to the KAN-30 placeholder", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ items: [task], total: 1, limit: 24, offset: 0 }));
  mount();
  expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  fireEvent.click(await screen.findByRole("link", { name: "Suma liczb" }));
  expect(screen.getByRole("heading", { name: "Szczegóły zadania" })).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls[0][0]).toMatch(/^\/student\/tasks\?/);
});

it("sends search, filters and sort to the backend and handles empty results", async () => {
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ items: [], total: 0, limit: 24, offset: 0 }));
  mount();
  await screen.findByText("Brak zadań");
  fireEvent.change(screen.getByLabelText("Wyszukaj"), { target: { value: "lista" } });
  fireEvent.change(screen.getByLabelText("Temat"), { target: { value: "Listy" } });
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "EASY" } });
  fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "FUNCTION" } });
  fireEvent.change(screen.getByLabelText(/Sortuj według/), { target: { value: "title:asc" } });
  await waitFor(() => {
    const params = new URL(vi.mocked(apiFetch).mock.calls.at(-1)![0], "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toMatchObject({ search: "lista", topic: "Listy", difficulty: "EASY", task_type: "FUNCTION", sort_by: "title", sort_order: "asc", offset: "0" });
  });
});

it("shows API errors and allows retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 500 })).mockImplementation(async () => Response.json({ items: [task], total: 1, limit: 24, offset: 0 }));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByText("Spróbuj ponownie"));
  expect(await screen.findByRole("link", { name: task.title })).toBeTruthy();
});
