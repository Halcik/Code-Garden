import { useState } from "react";
import LoginForm from "../components/auth/LoginForm";
import RegisterForm from "../components/auth/RegisterForm";
import logo from "../assets/code-garden-logo.png";
import ThemeSwitch from "../components/ThemeSwitch";
import { useAuth } from "../auth/AuthProvider";
import { authErrorMessage } from "../api/auth";
import "../styles/auth.css";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { user, loading, sessionError, signOut, retrySession } = useAuth();
  const [successMessage, setSuccessMessage] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  function switchMode(nextMode: "login" | "register") {
    setSuccessMessage("");
    setMode(nextMode);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await signOut();
      setMode("login");
      setSuccessMessage("Wylogowano pomyślnie.");
    } catch (error) {
      setLogoutError(authErrorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="brand-panel" aria-label="O Code Garden">
        <div className="brand">
          <img src={logo} alt="" width="56" height="56" />
          <span>Code Garden</span>
        </div>
        <h1>Ucz się Pythona krok po kroku</h1>
        <p className="brand-description">
          Teoria, krótkie quizy i praktyczne zadania w jednym miejscu. Możesz
          uczyć się samodzielnie albo pracować w grupie z nauczycielem.
        </p>
        <ul className="brand-benefits">
          <li>Lekcje z teorią i praktyką</li>
          <li>Automatyczne testy rozwiązań</li>
          <li>Podpowiedzi i czytelne informacje o błędach</li>
          <li>Postęp, osiągnięcia i praca w grupach</li>
        </ul>
      </aside>
      <section className="auth-content" aria-labelledby="auth-title">
        <ThemeSwitch />
        <div
          className={`auth-card ${mode === "register" ? "auth-card-register" : ""}`}
        >
          <h2 id="auth-title">Witaj w Code Garden</h2>
          <p className="auth-intro">
            Zaloguj się albo utwórz konto, aby rozpocząć naukę.
          </p>
          {!user && !loading && <div className="auth-switch" aria-label="Tryb formularza">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => switchMode("login")}
              disabled={formBusy}
            >
              Logowanie
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => switchMode("register")}
              disabled={formBusy}
            >
              Rejestracja
            </button>
          </div>}
          {loading ? (
            <p className="form-status" role="status">Sprawdzanie sesji…</p>
          ) : user ? (
            <div className="auth-session">
              <p className="form-status" role="status">Zalogowano jako {user.login}.</p>
              <button className="submit-button" type="button" onClick={logout} disabled={loggingOut}>
                {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
              </button>
              <p className="form-status form-status-error" role="alert">{logoutError}</p>
            </div>
          ) : mode === "login" ? (
            <LoginForm onRegister={() => switchMode("register")}
              onBusyChange={setFormBusy} successMessage={successMessage} />
          ) : (
            <RegisterForm onLogin={() => switchMode("login")} onBusyChange={setFormBusy}
              onRegistered={() => {
                setSuccessMessage("Konto zostało utworzone. Możesz się teraz zalogować.");
                setMode("login");
              }} />
          )}
          {!loading && sessionError && (
            <div>
              <p className="form-status form-status-error" role="alert">{sessionError}</p>
              <button className="text-button" type="button" onClick={retrySession} disabled={formBusy}>
                Sprawdź sesję ponownie
              </button>
            </div>
          )}
          {!user && !loading && mode === "login" && (
            <div className="role-info">
              <h3>Podczas rejestracji wybierasz rolę:</h3>
              <div className="role-grid">
                <div className="role-tile student">
                  <strong>Uczeń</strong>
                </div>
                <div className="role-tile">
                  <strong>Nauczyciel</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
