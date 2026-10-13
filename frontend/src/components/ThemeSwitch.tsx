import { useTheme } from "../theme/ThemeProvider";
import "../styles/theme-switch.css";

export default function ThemeSwitch() {
  const { preference, setPreference } = useTheme();

  return (
    <label className="theme-switch">
      <span>Motyw</span>
      <select
        value={preference}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "light" || value === "dark" || value === "system") {
            setPreference(value);
          }
        }}
      >
        <option value="system">Systemowy</option>
        <option value="light">Jasny</option>
        <option value="dark">Ciemny</option>
      </select>
    </label>
  );
}
