import { useState } from "react";
import type { FormEvent } from "react";
import FormField from "./FormField";

type Role = "student" | "teacher";
type Errors = Partial<
  Record<"login" | "email" | "password" | "confirmPassword", string>
>;

export default function RegisterForm({ onLogin }: { onLogin: () => void }) {
  const [role, setRole] = useState<Role>("student");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Errors = {};
    if (login.trim().length < 3)
      nextErrors.login = "Login musi mieć co najmniej 3 znaki.";
    if (role === "teacher" && !email.trim())
      nextErrors.email = "Podaj e-mail nauczyciela.";
    else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = "Podaj poprawny adres e-mail.";
    if (password.length < 8)
      nextErrors.password = "Hasło musi mieć co najmniej 8 znaków.";
    if (!confirmPassword) nextErrors.confirmPassword = "Powtórz hasło.";
    else if (password !== confirmPassword)
      nextErrors.confirmPassword = "Hasła muszą być takie same.";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;
    setMessage(
      "Formularz poprawny. Konto nie zostało utworzone — rejestracja nie jest jeszcze podłączona.",
    );
  }

  return (
    <form
      className="auth-form register-form"
      onSubmit={submit}
      noValidate
      onChange={() => setMessage("")}
    >
      <fieldset className="role-choice">
        <legend>Wybierz rolę</legend>
        <div className="role-grid">
          <label
            className={`role-tile ${role === "student" ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="role"
              value="student"
              checked={role === "student"}
              onChange={() => {
                setRole("student");
                setErrors((previous) => ({ ...previous, email: undefined }));
              }}
            />
            <strong>Uczeń</strong>
            <span>Login wymagany, e-mail opcjonalny</span>
          </label>
          <label
            className={`role-tile ${role === "teacher" ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="role"
              value="teacher"
              checked={role === "teacher"}
              onChange={() => {
                setRole("teacher");
                setErrors((previous) => ({ ...previous, email: undefined }));
              }}
            />
            <strong>Nauczyciel</strong>
            <span>Wymagany e-mail i akceptacja administratora</span>
          </label>
        </div>
      </fieldset>
      <div className="register-fields">
        <FormField
          id="register-login"
          label="Login"
          value={login}
          onChange={setLogin}
          placeholder="Wpisz login (minimum 3 znaki)"
          autoComplete="username"
          error={errors.login}
        />
        <FormField
          id="email"
          label={role === "teacher" ? "E-mail" : "E-mail (opcjonalnie)"}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="Wpisz adres e-mail"
          autoComplete="email"
          required={role === "teacher"}
          error={errors.email}
        />
        <FormField
          id="register-password"
          label="Hasło"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Wpisz hasło (minimum 8 znaków)"
          autoComplete="new-password"
          error={errors.password}
        />
        <FormField
          id="confirm-password"
          label="Powtórz hasło"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Wpisz hasło ponownie"
          autoComplete="new-password"
          error={errors.confirmPassword}
        />
      </div>
      <button className="submit-button" type="submit">
        Utwórz konto
      </button>
      <p className="form-status" role="status">
        {message}
      </p>
      <p className="auth-alternative">
        Masz już konto?{" "}
        <button className="text-button" type="button" onClick={onLogin}>
          Zaloguj się
        </button>
      </p>
    </form>
  );
}
