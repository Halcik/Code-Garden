import { useAuth } from "../auth/AuthProvider";
import LogoutButton from "../components/LogoutButton";

export default function AccountAccessPage({ message }: { message: string }) {
  const { retrySession } = useAuth();
  return <main className="account-access">
    <h1>Dostęp do konta</h1>
    <p role="status">{message}</p>
    <button type="button" onClick={retrySession}>Sprawdź status ponownie</button>
    <LogoutButton />
  </main>;
}
