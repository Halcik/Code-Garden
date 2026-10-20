import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import PythonCodeEditor from "./PythonCodeEditor";

const theme = vi.hoisted(() => ({ value: "light" }));
const editor = vi.hoisted(() => vi.fn());
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: theme.value }) }));
vi.mock("@monaco-editor/react", () => ({ loader: { config: vi.fn() }, default: (props: unknown) => { editor(props); return null; } }));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({ default: class {} }));
vi.mock("monaco-editor/languages/definitions/python/register", () => ({}));
vi.mock("monaco-editor/editor/editor.api", () => ({}));

beforeEach(() => { vi.clearAllMocks(); theme.value = "light"; });
afterEach(cleanup);
function props() { return editor.mock.calls.at(-1)![0]; }

it("keeps teacher defaults and maps the application theme without changing the value", () => {
  const onChange = vi.fn();
  const { rerender } = render(<PythonCodeEditor value="print(1)" onChange={onChange} />);
  expect(props()).toMatchObject({ value: "print(1)", language: "python", theme: "light", height: 320, options: { ariaLabel: "Kod startowy Python", readOnly: false, domReadOnly: false, minimap: { enabled: false }, lineNumbers: "on", tabSize: 4, insertSpaces: true, automaticLayout: true, scrollBeyondLastLine: false } });
  theme.value = "dark";
  rerender(<PythonCodeEditor value="print(1)" onChange={onChange} />);
  expect(props()).toMatchObject({ value: "print(1)", theme: "vs-dark" });
  expect(onChange).not.toHaveBeenCalled();
});

it("supports explicit theme, accessible label and optional height", () => {
  theme.value = "dark";
  const { rerender } = render(<PythonCodeEditor value="" onChange={vi.fn()} theme="light" ariaLabel="Kod ucznia" height={480} />);
  expect(props()).toMatchObject({ theme: "light", height: 480, options: { ariaLabel: "Kod ucznia" } });
  rerender(<PythonCodeEditor value="" onChange={vi.fn()} theme="dark" />);
  expect(props().theme).toBe("vs-dark");
});

it("forwards edits and maps a cleared Monaco value to an empty string", () => {
  const onChange = vi.fn();
  render(<PythonCodeEditor value="starter" onChange={onChange} />);
  props().onChange("student code"); props().onChange(undefined);
  expect(onChange.mock.calls).toEqual([["student code"], [""]]);
});

it("prevents changes while readOnly even if Monaco emits a change", () => {
  const onChange = vi.fn();
  render(<PythonCodeEditor value="teacher code" onChange={onChange} readOnly />);
  expect(props().options).toMatchObject({ readOnly: true, domReadOnly: true });
  props().onChange("unexpected edit");
  expect(onChange).not.toHaveBeenCalled();
});
