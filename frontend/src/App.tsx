import AuthPage from "./pages/AuthPage";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/theme.css";

export default function App() {
  return (
    <ThemeProvider>
      <AuthPage />
    </ThemeProvider>
  );
}
