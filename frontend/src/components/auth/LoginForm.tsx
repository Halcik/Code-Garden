import { useState } from "react";
import type { FormEvent } from "react";
import FormField from "./FormField";
import { AuthApiError, authErrorMessage } from "../../api/auth";
import { useAuth } from "../../auth/AuthProvider";

export default function LoginForm({ onRegister, onBusyChange, successMessage = "" }: {
  onRegister: () => void;
  onBusyChange: (busy: boolean) => void;
  successMessage?: string;
}) {
  const { signIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ login?: string; password?: string }>(
    {},
  );
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = {
      login: login.trim() ? undefined : "Podaj login.",
      password: password ? undefined : "Podaj hasło.",
    };
    setErrors(nextErrors);
    setMessage("");
    setRequestError("");
    if (Object.values(nextErrors).some(Boolean)) return;
    setSubmitting(true);
    onBusyChange(true);
    try {
      await signIn({ login: login.trim(), password });
    } catch (error) {
      setRequestError(authErrorMessage(error));
      if (error instanceof AuthApiError) setErrors(error.fieldErrors);
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      className="auth-form"
      onSubmit={submit}
      noValidate
      onChange={() => { setMessage(""); setRequestError(""); }}
      aria-busy={submitting}
    >
      <FormField
        id="login"
        label="Login"
        value={login}
        onChange={setLogin}
        placeholder="Wpisz login"
        autoComplete="username"
        error={errors.login}
        disabled={submitting}
      />
      <FormField
        id="password"
        label="Hasło"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Wpisz hasło"
        autoComplete="current-password"
        error={errors.password}
        disabled={submitting}
      />
      <button
        className="forgot-password text-button"
        type="button"
        disabled={submitting}
        onClick={() =>
          setMessage(
            "Odzyskiwanie hasła nie jest jeszcze dostępne.",
          )
        }
      >
        Nie pamiętasz hasła?
      </button>
      <button className="submit-button" type="submit" disabled={submitting}>
        {submitting ? "Logowanie…" : "Zaloguj się"}
      </button>
      <p className="form-status form-status-error" role="alert">{requestError}</p>
      <p className="form-status" role="status">
        {message || successMessage}
      </p>
      <p className="auth-alternative">
        Nie masz konta?{" "}
        <button className="text-button" type="button" onClick={onRegister} disabled={submitting}>
          Utwórz konto
        </button>
      </p>
    </form>
  );
}
