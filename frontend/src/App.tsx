import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/theme.css";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthPage />
      </AuthProvider>
    </ThemeProvider>
  );
}
