import { useState } from "react";
import { authErrorMessage } from "../api/auth";
import { useAuth } from "../auth/AuthProvider";

export default function LogoutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await signOut(); }
    catch (error) { setError(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <div className="logout-control">
    <button type="button" onClick={logout} disabled={busy}>
      {busy ? "Wylogowywanie…" : "Wyloguj się"}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
