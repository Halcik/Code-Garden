import { expect, it } from "vitest";
import { fallbackMessage, friendlyMessages, parsePythonError } from "./pythonError";

it.each(["script.py", "/box/script.py", "./script.py"])("recognizes the configured Judge0 student file %s", filename => {
  const raw = `Traceback (most recent call last):\n  File "${filename}", line 7, in <module>\n    int("x")\n  File "/usr/lib/python/helper.py", line 99, in helper\nValueError: invalid literal`;
  expect(parsePythonError(raw)).toMatchObject({ exception_type: "ValueError", line_number: 7 });
});

it("extracts a syntax error line from Judge0 script.py", () => {
  expect(parsePythonError('  File "/box/script.py", line 4\n    if True\n           ^\nSyntaxError: expected colon')).toMatchObject({ exception_type: "SyntaxError", line_number: 4 });
});

it.each(Object.keys(friendlyMessages))("parses %s and preserves the traceback", type => {
  const raw = `Traceback (most recent call last):\n  File "main.py", line 7, in <module>\n    bad()\n${type}: problem\n`;
  expect(parsePythonError(raw)).toEqual({ exception_type: type, line_number: 7, original_error: raw, friendly_message_pl: friendlyMessages[type] });
});
it("selects the innermost student frame instead of library and wrapper frames", () => {
  const raw = 'Traceback (most recent call last):\n  File "wrapper.py", line 99, in run\n  File "main.py", line 7, in <module>\n  File "main.py", line 3, in f\n  File "/usr/lib/python/module.py", line 42, in f\nValueError: bad';
  expect(parsePythonError(raw).line_number).toBe(3);
});
it("does not guess a student line from internal frames", () => {
  expect(parsePythonError('  File "/internal/wrapper.py", line 40\nRuntimeError: bad').line_number).toBeNull();
});
it("handles syntax compilation output", () => {
  expect(parsePythonError('  File "main.py", line 2\n    if\n      ^\nSyntaxError: invalid syntax')).toMatchObject({ exception_type: "SyntaxError", line_number: 2 });
});
it("supports unknown exceptions and missing lines", () => {
  expect(parsePythonError("CustomProblem: details")).toEqual({ exception_type: "CustomProblem", line_number: null, original_error: "CustomProblem: details", friendly_message_pl: fallbackMessage });
  expect(parsePythonError("unstructured output").exception_type).toBeNull();
});
it("uses the final exception in a chain without reusing a previous line", () => {
  expect(parsePythonError('Traceback (most recent call last):\n  File "main.py", line 3\nNameError: x\n\nTraceback (most recent call last):\n  File "/internal/tool.py", line 20\nRuntimeError: failed')).toMatchObject({ exception_type: "RuntimeError", line_number: null });
});
