import { useTheme } from "../../theme/ThemeProvider";
const assets = import.meta.glob<string>("../../assets/teacher/editor/*.svg", { eager: true, query: "?url", import: "default" });
export type EditorIconName = "Eye" | "Play" | "Save" | "Plus" | "GripVertical" | "Settings" | "Play1" | "Send" | "Archive";
export default function EditorIcon({ name }: { name: EditorIconName }) {
  const { theme } = useTheme();
  if (name === "Archive") return <span aria-hidden="true" className="editor-icon editor-archive-icon"
    style={{ maskImage: `url("${assets[`../../assets/teacher/editor/${theme}-Archive.svg`]}")` }} />;
  return <img className="editor-icon" alt="" src={assets[`../../assets/teacher/editor/${theme}-${name === "Play1" && theme === "dark" ? "Play" : name}.svg`]} />;
}
