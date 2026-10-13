import { useState } from "react";
import type { FormEvent } from "react";
import FormField from "./FormField";

export default function LoginForm({ onRegister }: { onRegister: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ login?: string; password?: string }>(
    {},
  );
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      login: login.trim() ? undefined : "Podaj login.",
      password: password ? undefined : "Podaj hasło.",
    };
    setErrors(nextErrors);
    setMessage("");
    if (Object.values(nextErrors).some(Boolean)) return;
    setMessage("Formularz poprawny. Logowanie nie jest jeszcze podłączone.");
  }

  return (
    <form
      className="auth-form"
      onSubmit={submit}
      noValidate
      onChange={() => setMessage("")}
    >
      <FormField
        id="login"
        label="Login"
        value={login}
        onChange={setLogin}
        placeholder="Wpisz login"
        autoComplete="username"
        error={errors.login}
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
      />
      <button
        className="forgot-password text-button"
        type="button"
        onClick={() =>
          setMessage(
            "Odzyskiwanie hasła będzie dostępne po podłączeniu backendu.",
          )
        }
      >
        Nie pamiętasz hasła?
      </button>
      <button className="submit-button" type="submit">
        Zaloguj się
      </button>
      <p className="form-status" role="status">
        {message}
      </p>
      <p className="auth-alternative">
        Nie masz konta?{" "}
        <button className="text-button" type="button" onClick={onRegister}>
          Utwórz konto
        </button>
      </p>
    </form>
  );
}
