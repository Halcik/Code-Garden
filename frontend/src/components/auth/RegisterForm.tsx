import { useState } from "react";
import type { FormEvent } from "react";
import FormField from "./FormField";
import { AuthApiError, authErrorMessage, register } from "../../api/auth";
import type { User } from "../../api/auth";

type Role = "student" | "teacher";
type Errors = Partial<
  Record<"login" | "email" | "password" | "confirmPassword", string>
>;

export default function RegisterForm({ onLogin, onRegistered, onBusyChange }: {
  onLogin: () => void;
  onRegistered: (user: User) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [role, setRole] = useState<Role>("student");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors: Errors = {};
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(login.trim()))
      nextErrors.login = "Login musi mieć 3–50 znaków: litery, cyfry, _, . lub -.";
    if (role === "teacher" && !email.trim())
      nextErrors.email = "Podaj e-mail nauczyciela.";
    else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = "Podaj poprawny adres e-mail.";
    if (password.length < 8 || password.length > 128)
      nextErrors.password = "Hasło musi mieć od 8 do 128 znaków.";
    if (!confirmPassword) nextErrors.confirmPassword = "Powtórz hasło.";
    else if (password !== confirmPassword)
      nextErrors.confirmPassword = "Hasła muszą być takie same.";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    onBusyChange(true);
    try {
      const user = await register({ login: login.trim(), password,
        role: role === "teacher" ? "TEACHER" : "STUDENT",
        email: email.trim() || null });
      onRegistered(user);
    } catch (error) {
      setMessage(authErrorMessage(error));
      if (error instanceof AuthApiError) setErrors(error.fieldErrors);
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      className="auth-form register-form"
      onSubmit={submit}
      noValidate
      onChange={() => setMessage("")}
      aria-busy={submitting}
    >
      <fieldset className="role-choice" disabled={submitting}>
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
            <span>E-mail i akceptacja administratora wymagane</span>
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
          disabled={submitting}
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
          disabled={submitting}
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
          disabled={submitting}
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
          disabled={submitting}
        />
      </div>
      <button className="submit-button" type="submit" disabled={submitting}>
        {submitting ? "Tworzenie konta…" : "Utwórz konto"}
      </button>
      <p className="form-status form-status-error" role="alert">
        {message}
      </p>
      <p className="auth-alternative">
        Masz już konto?{" "}
        <button className="text-button" type="button" onClick={onLogin} disabled={submitting}>
          Zaloguj się
        </button>
      </p>
    </form>
  );
}
