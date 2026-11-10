import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentTasksPage from "./StudentTasksPage";
import { apiFetch } from "../api/client";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const retrySession = vi.fn();
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const task = { id: 7, title: "Z katalogu", description: "Opis", topic: "Python", difficulty: "EASY", task_type: "STANDARD", estimated_time_minutes: 15 };
function mount() { return render(<MemoryRouter><StudentTasksPage /></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async path => {
    const assigned = new URL(path, "http://localhost").searchParams.get("view") === "assigned";
    return Response.json({ items: [{ ...task, id: assigned ? 8 : 7, title: assigned ? "Od nauczyciela" : "Z katalogu" }], total: 1, limit: 24, offset: 0 });
  });
});
afterEach(cleanup);

it("shows assigned and catalogue cards together without a separate source switch", async () => {
  mount();
  const assigned = within(screen.getByRole("region", { name: "Przypisane zadania" }));
  const catalog = within(screen.getByRole("region", { name: "Katalog zadań" }));
  expect(await assigned.findByRole("link", { name: "Od nauczyciela" })).toBeTruthy();
  expect(await catalog.findByRole("link", { name: "Z katalogu" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Źródło zadań" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Z katalogu" })).toBeNull();
  expect(screen.getByRole("button", { name: /^Wszystkie/ })).toBeTruthy();
});

it("keeps the catalogue usable when the assigned section is empty", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => Response.json({
    items: path.includes("view=assigned") ? [] : [task], total: path.includes("view=assigned") ? 0 : 1, limit: 24, offset: 0,
  }));
  mount();
  expect(await screen.findByText("Brak przypisanych zadań")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Z katalogu" })).toBeTruthy();
});

it("retries assigned tasks independently from the catalogue", async () => {
  let fail = true;
  vi.mocked(apiFetch).mockImplementation(async path => {
    if (path.includes("view=assigned") && fail) return Response.json({}, { status: 500 });
    return Response.json({ items: [task], total: 1, limit: 24, offset: 0 });
  });
  mount();
  const assigned = within(screen.getByRole("region", { name: "Przypisane zadania" }));
  await assigned.findByRole("alert");
  expect(await within(screen.getByRole("region", { name: "Katalog zadań" })).findByRole("link", { name: "Z katalogu" })).toBeTruthy();
  fail = false;
  fireEvent.click(assigned.getByRole("button", { name: "Odśwież przypisane zadania" }));
  expect(await assigned.findByRole("link", { name: "Z katalogu" })).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path.includes("view=catalog"))).toHaveLength(1);
});
