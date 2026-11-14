import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeacherSubmissionsPage from "./TeacherSubmissionsPage";
import { apiFetch } from "../api/client";
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "dark" }) }));
vi.mock("../components/PythonCodeEditor", () => ({ default: () => <pre>print(1)</pre> }));
vi.mock("../components/teacher/TeacherStudentNote", () => ({ default: () => <p>Notatka prywatna</p> }));
let claimed = false;
let conflict = false;
const student = { id: 3, login: "Anna", status: "ACTIVE" };
const version = () => ({ id: 10, version: 1, submitted_at: "2026-11-13T10:00:00Z", reviewer_teacher_id: claimed ? 2 : null,
  is_catalog_submission: true, passed_tests: 1, failed_tests: 0, total_tests: 1, all_passed: true });
beforeEach(() => {
  claimed = false; conflict = false;
  vi.mocked(apiFetch).mockReset().mockImplementation(async path => {
    if (path.endsWith("/claim")) { if (conflict) return Response.json({}, { status: 409 }); claimed = true; return Response.json({ reviewer_teacher_id: 2 }); }
    if (path.endsWith("/task")) return Response.json({ id: 7, title: "Zadanie", instructions: "Wypisz liczbę" });
    if (path.includes("/students/")) return Response.json({ student, items: [version()] });
    return Response.json({ ...version(), student, task_id: 7, source_code: "print(1)", total_hints: 0, used_hints: [], test_results: [] });
  });
});
afterEach(cleanup);
function mount() { render(<MemoryRouter initialEntries={["/teacher/submissions/tasks/7/students/3"]}><Routes><Route path="/teacher/submissions/tasks/:taskId/students/:studentId" element={<TeacherSubmissionsPage />} /><Route path="/teacher/submissions" element={<p>Kolejka prac</p>} /></Routes></MemoryRouter>); }
it("requires a claim before showing grading controls and private notes", async () => {
  mount(); const button = await screen.findByRole("button", { name: "Przejmij do recenzji" });
  expect(screen.queryByLabelText("Feedback dla ucznia")).toBeNull(); expect(screen.queryByText("Notatka prywatna")).toBeNull();
  fireEvent.click(button);
  expect(await screen.findByLabelText("Feedback dla ucznia")).toBeTruthy();
  expect(screen.getByText("Notatka prywatna")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.filter(([url]) => url.endsWith("/claim"))).toHaveLength(1);
});
it("refreshes after a claim conflict and offers a way back to the queue", async () => {
  conflict = true; mount(); fireEvent.click(await screen.findByRole("button", { name: "Przejmij do recenzji" }));
  await waitFor(() => expect(screen.getAllByRole("alert")[0].textContent).toContain("już przejęte"));
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(([url]) => url.includes("/students/3/submissions")).length).toBe(2));
  fireEvent.click(screen.getByRole("link", { name: "Wróć do kolejki" }));
  expect(await screen.findByText("Kolejka prac")).toBeTruthy();
});
