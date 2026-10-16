import { useTheme } from "../../theme/ThemeProvider";
import logo from "../../assets/code-garden-logo.png";

const assets = import.meta.glob<string>("../../assets/admin/*", { eager: true, query: "?url", import: "default" });
type IconName = "CodeGardenLogo" | "Users" | "Avatar" | "GraduationCap" | "Presentation" | "ShieldCheck" | "ShieldAlert" | "Check";
const sizes: Record<IconName, number> = { CodeGardenLogo: 34, Users: 17, Avatar: 30, GraduationCap: 16, Presentation: 16, ShieldCheck: 16, ShieldAlert: 16, Check: 15 };

export default function DesignIcon({ name }: { name: IconName }) {
  const { theme } = useTheme();
  const src = name === "CodeGardenLogo" ? logo : assets[`../../assets/admin/${theme}-${name}.svg`];
  if (name === "CodeGardenLogo") return <img src={src} alt="" width={sizes[name]} height={sizes[name]} />;
  // Keep the original SVG shape, with its color supplied by the shared theme.
  return <span aria-hidden="true" className={`design-icon design-icon-${name}`}
    style={{ width: sizes[name], height: sizes[name], maskImage: `url("${src}")` }} />;
}
