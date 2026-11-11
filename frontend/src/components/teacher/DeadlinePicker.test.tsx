import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import DeadlinePicker from "./DeadlinePicker";

afterEach(cleanup);
function Picker() {
  const [value, setValue] = useState("2030-11-20T15:30");
  return <DeadlinePicker label="Termin" value={value} onChange={setValue} />;
}
it("selects a local day, preserves time and clears the deadline", () => {
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "Wybierz datę: Termin" }));
  fireEvent.click(screen.getByRole("button", { name: "21 listopada 2030" }));
  expect((screen.getByLabelText("Termin") as HTMLInputElement).value).toBe("2030-11-21T15:30");
  fireEvent.change(screen.getByLabelText("Godzina"), { target: { value: "23:59" } });
  expect((screen.getByLabelText("Termin") as HTMLInputElement).value).toBe("2030-11-21T23:59");
  fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));
  expect((screen.getByLabelText("Termin") as HTMLInputElement).value).toBe("");
});
it("navigates months and closes only the calendar on Escape", () => {
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "Wybierz datę: Termin" }));
  fireEvent.click(screen.getByRole("button", { name: "Następny miesiąc" }));
  expect(screen.getByText("grudzień 2030")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("group", { name: "Kalendarz terminu" }), { key: "Escape" });
  expect(screen.queryByRole("group")).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText("Termin"));
});
it("disables the input and calendar trigger while saving", () => {
  render(<DeadlinePicker label="Termin" value="" onChange={vi.fn()} disabled />);
  expect((screen.getByLabelText("Termin") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});
