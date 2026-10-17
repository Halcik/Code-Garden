import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import "monaco-editor/languages/definitions/python/register";
import { useTheme } from "../theme/ThemeProvider";

// Keep the editor and its worker local, without a CDN dependency.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
};

export default function PythonCodeEditor({ value, onChange, readOnly = false, height = 320 }: Props) {
  const { theme } = useTheme();
  return <Editor height={height} language="python" value={value}
    onChange={next => { if (!readOnly) onChange(next ?? ""); }}
    theme={theme === "dark" ? "vs-dark" : "light"}
    loading={<p role="status">Ładowanie edytora kodu…</p>}
    options={{ readOnly, domReadOnly: readOnly, ariaLabel: "Kod startowy Python", lineNumbers: "on",
      minimap: { enabled: false }, tabSize: 4, insertSpaces: true, automaticLayout: true,
      scrollBeyondLastLine: false, fontSize: 14 }} />;
}
