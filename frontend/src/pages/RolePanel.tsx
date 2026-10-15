import LogoutButton from "../components/LogoutButton";

export default function RolePanel({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <LogoutButton />
    </main>
  );
}
