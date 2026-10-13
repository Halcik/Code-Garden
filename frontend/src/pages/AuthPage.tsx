import { useState } from "react";
import LoginForm from "../components/auth/LoginForm";
import RegisterForm from "../components/auth/RegisterForm";
import logo from "../assets/code-garden-logo.png";
import ThemeSwitch from "../components/ThemeSwitch";
import "../styles/auth.css";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");

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
          <div className="auth-switch" aria-label="Tryb formularza">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => setMode("login")}
            >
              Logowanie
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => setMode("register")}
            >
              Rejestracja
            </button>
          </div>
          {mode === "login" ? (
            <LoginForm onRegister={() => setMode("register")} />
          ) : (
            <RegisterForm onLogin={() => setMode("login")} />
          )}
          {mode === "login" && (
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
