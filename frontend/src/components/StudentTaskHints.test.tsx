import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import StudentTaskHints from "./StudentTaskHints";
import { apiFetch } from "../api/client";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const first = { number: 1, title: "Kierunek", content: "Zacznij od warunku." };
const second = { number: 2, title: "Schemat", content: "Użyj pętli.\nPotem zwróć wynik." };
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function paths() { return vi.mocked(apiFetch).mock.calls.map(([path]) => path); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async path => Response.json(path.endsWith("/hints") ? { total: 2 } : path.endsWith("/1") ? first : second));
});
afterEach(cleanup);

it("loads only the count and reveals one hint per click in teacher order", async () => {
  render(<StudentTaskHints taskId={7} />);
  expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  const button = await screen.findByRole("button", { name: "Pokaż podpowiedź" });
  expect(paths()).toEqual(["/student/tasks/7/hints"]);
  expect(screen.getByText("Wykorzystane podpowiedzi: 0 z 2")).toBeTruthy();
  expect(screen.queryByText(first.content)).toBeNull(); expect(screen.queryByText(second.content)).toBeNull();
  fireEvent.click(button);
  expect(await screen.findByText(first.content)).toBeTruthy();
  expect(screen.getByText("Wykorzystane podpowiedzi: 1 z 2")).toBeTruthy();
  expect(screen.queryByText(second.title)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pokaż kolejną podpowiedź" }));
  expect(await screen.findByText("Wszystkie podpowiedzi zostały wyświetlone.")).toBeTruthy();
  expect(screen.getByText("Wykorzystane podpowiedzi: 2 z 2")).toBeTruthy();
  expect(screen.getByText(first.content)).toBeTruthy();
  expect(screen.getByText("Użyj pętli. Potem zwróć wynik.").textContent).toBe(second.content);
  expect(screen.queryByRole("button")).toBeNull();
  expect(paths()).toEqual(["/student/tasks/7/hints", "/student/tasks/7/hints/1", "/student/tasks/7/hints/2"]);
});

it("handles no hints without a reveal button", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 0 }));
  render(<StudentTaskHints taskId={7} />);
  expect(await screen.findByText("Do tego zadania nie dodano podpowiedzi.")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(paths()).toHaveLength(1);
});

it("preserves revealed hints through rerenders without requesting another hint", async () => {
  const { rerender } = render(<StudentTaskHints taskId={7} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  await screen.findByText(first.content);
  rerender(<StudentTaskHints taskId={7} />);
  expect(screen.getByText(first.content)).toBeTruthy();
  expect(paths()).toHaveLength(2);
});

it("blocks duplicate reveals while loading", async () => {
  const pending = deferred();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 2 })).mockReturnValueOnce(pending.promise);
  render(<StudentTaskHints taskId={7} />);
  const button = await screen.findByRole("button", { name: "Pokaż podpowiedź" });
  fireEvent.click(button); fireEvent.click(button);
  expect((screen.getByRole("button", { name: "Pobieranie podpowiedzi…" }) as HTMLButtonElement).disabled).toBe(true);
  expect(paths()).toHaveLength(2);
  await act(async () => { pending.resolve(Response.json(first)); });
  expect(screen.getByText("Wykorzystane podpowiedzi: 1 z 2")).toBeTruthy();
});

it("retries a count failure", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
  render(<StudentTaskHints taskId={7} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await screen.findByRole("button", { name: "Pokaż podpowiedź" });
  expect(paths()).toEqual(["/student/tasks/7/hints", "/student/tasks/7/hints"]);
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it("retries a failed reveal without advancing the counter or losing prior hints", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 2 })).mockResolvedValueOnce(Response.json(first))
    .mockRejectedValueOnce(new Error("Brak połączenia")).mockResolvedValueOnce(Response.json(second));
  render(<StudentTaskHints taskId={7} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  await screen.findByText(first.content);
  fireEvent.click(screen.getByRole("button", { name: "Pokaż kolejną podpowiedź" }));
  await screen.findByRole("alert");
  expect(screen.getByText(first.content)).toBeTruthy();
  expect(screen.getByText("Wykorzystane podpowiedzi: 1 z 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await screen.findByText("Wszystkie podpowiedzi zostały wyświetlone.");
  expect(paths().slice(-2)).toEqual(["/student/tasks/7/hints/2", "/student/tasks/7/hints/2"]);
});

it.each([401, 403, 404])("handles count HTTP %s without leaking any hint", async status => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status }));
  render(<StudentTaskHints taskId={7} />); await screen.findByRole("alert");
  expect(auth.retrySession).toHaveBeenCalledTimes(status === 404 ? 0 : 1);
  expect(screen.queryByText(first.content)).toBeNull();
});

it.each([401, 403, 404])("handles reveal HTTP %s without incrementing usage", async status => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 2 })).mockResolvedValueOnce(new Response(null, { status }));
  render(<StudentTaskHints taskId={7} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  await screen.findByRole("alert");
  expect(auth.retrySession).toHaveBeenCalledTimes(status === 404 ? 0 : 1);
  expect(screen.getByText("Wykorzystane podpowiedzi: 0 z 2")).toBeTruthy();
  expect(screen.queryByText(first.content)).toBeNull();
});

it.each(["count", "reveal"])("aborts stale %s responses on task change and resets the reveal session", async phase => {
  const pending = deferred();
  if (phase === "count") vi.mocked(apiFetch).mockReturnValueOnce(pending.promise);
  else vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 2 })).mockReturnValueOnce(pending.promise);
  const { rerender } = render(<StudentTaskHints taskId={7} />);
  if (phase === "reveal") fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  const signal = vi.mocked(apiFetch).mock.calls.at(-1)![1]?.signal;
  rerender(<StudentTaskHints taskId={8} />);
  await screen.findByRole("button", { name: "Pokaż podpowiedź" });
  expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(Response.json(phase === "count" ? { total: 99 } : first)); });
  expect(screen.getByText("Wykorzystane podpowiedzi: 0 z 2")).toBeTruthy();
  expect(screen.queryByText(first.content)).toBeNull();
  expect(paths().at(-1)).toBe("/student/tasks/8/hints");
});

it("aborts a reveal on unmount and ignores stale auth errors", async () => {
  const pending = deferred();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 2 })).mockReturnValueOnce(pending.promise);
  const { unmount } = render(<StudentTaskHints taskId={7} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  const signal = vi.mocked(apiFetch).mock.calls.at(-1)![1]?.signal;
  unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(new Response(null, { status: 401 })); });
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it("renders hint content as text rather than HTML", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ total: 1 })).mockResolvedValueOnce(Response.json({ ...first, content: '<img src=x onerror="alert(1)">' }));
  render(<StudentTaskHints taskId={7} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
});
