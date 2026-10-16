import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "../api/auth";
import { ProtectedRoute, PublicRoute } from "./RouteGuards";

const auth = vi.hoisted(() => ({
  user: null as User | null, loading: false, sessionError: "",
  retrySession: vi.fn(), signOut: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));

const activeStudent: User = { id: 1, login: "student", email: null, role: "STUDENT", status: "ACTIVE", teacher_approval: null, created_at: "2026-10-15T10:00:00Z" };

function Location() { return <output aria-label="Adres">{useLocation().pathname}</output>; }
function Routing({ path }: { path: string }) {
  return <MemoryRouter initialEntries={[path]}><Location /><Routes>
    <Route element={<PublicRoute />}><Route path="/login" element={<p>Formularz logowania</p>} /></Route>
    {(["STUDENT", "TEACHER", "ADMIN"] as const).map(role => <Route key={role} element={<ProtectedRoute role={role} />}>
      <Route path={`/${role.toLowerCase()}`} element={<p>Obszar {role}</p>} />
    </Route>)}
  </Routes></MemoryRouter>;
}
function routing(path: string) {
  return render(<Routing path={path} />);
}

beforeEach(() => { auth.user = null; auth.loading = false; auth.sessionError = ""; vi.clearAllMocks(); });
afterEach(cleanup);

describe("route access", () => {
  it.each(["/student", "/teacher", "/admin"])("redirects anonymous user from %s", path => {
    routing(path);
    expect(screen.getByLabelText("Adres").textContent).toBe("/login");
    expect(screen.getByText("Formularz logowania")).toBeTruthy();
  });

  it.each(["STUDENT", "TEACHER", "ADMIN"] as const)("keeps %s in their own role area", role => {
    auth.user = { ...activeStudent, role, teacher_approval: role === "TEACHER" ? "APPROVED" : null };
    for (const path of ["/student", "/teacher", "/admin", "/login"]) {
      const view = routing(path);
      expect(screen.getByLabelText("Adres").textContent).toBe(`/${role.toLowerCase()}`);
      expect(screen.getByText(`Obszar ${role}`)).toBeTruthy();
      view.unmount();
    }
  });

  it("waits for session check without redirecting", () => {
    auth.loading = true;
    const view = routing("/admin");
    expect(screen.getByText("Sprawdzanie sesji…")).toBeTruthy();
    expect(screen.getByLabelText("Adres").textContent).toBe("/admin");
    auth.loading = false;
    view.rerender(<Routing path="/admin" />);
    expect(screen.getByLabelText("Adres").textContent).toBe("/login");
  });

  it("blocks access and allows retry on session error", () => {
    auth.user = activeStudent;
    auth.sessionError = "Brak połączenia";
    routing("/student");
    expect(screen.queryByText("Obszar STUDENT")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Brak połączenia");
    fireEvent.click(screen.getByRole("button", { name: "Sprawdź sesję ponownie" }));
    expect(auth.retrySession).toHaveBeenCalledOnce();
  });

  it.each(["STUDENT", "TEACHER", "ADMIN"] as const)("blocks inactive %s", role => {
    auth.user = { ...activeStudent, role, status: "INACTIVE", teacher_approval: role === "TEACHER" ? "APPROVED" : null };
    routing(`/${role.toLowerCase()}`);
    expect(screen.getByText(/Twoje konto jest nieaktywne/)).toBeTruthy();
    expect(screen.queryByText(`Obszar ${role}`)).toBeNull();
  });

  it.each(["PENDING", "REJECTED"] as const)("blocks teacher with %s approval", teacher_approval => {
    auth.user = { ...activeStudent, role: "TEACHER", teacher_approval };
    routing("/teacher");
    expect(screen.getByRole("heading", { name: "Dostęp do konta" })).toBeTruthy();
    expect(screen.queryByText("Obszar TEACHER")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sprawdź status ponownie" }));
    expect(auth.retrySession).toHaveBeenCalledOnce();
  });

  it("removes role content when the session is cleared or disabled", () => {
    auth.user = activeStudent;
    const view = routing("/student");
    expect(screen.getByText("Obszar STUDENT")).toBeTruthy();
    auth.user = { ...activeStudent, status: "INACTIVE" };
    view.rerender(<Routing path="/student" />);
    expect(screen.queryByText("Obszar STUDENT")).toBeNull();
    expect(screen.getByText(/Twoje konto jest nieaktywne/)).toBeTruthy();
    auth.user = null;
    view.rerender(<Routing path="/student" />);
    expect(screen.getByLabelText("Adres").textContent).toBe("/login");
  });
});
