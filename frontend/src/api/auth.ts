export type UserRole = "STUDENT" | "TEACHER" | "ADMIN";
export type User = {
  id: number;
  login: string;
  email: string | null;
  role: UserRole;
  created_at: string;
};
export type LoginRequest = { login: string; password: string };
export type RegisterRequest = LoginRequest & {
  role: "STUDENT" | "TEACHER";
  email?: string | null;
};
export type AuthFieldErrors = Partial<Record<"login" | "email" | "password", string>>;

export class AuthApiError extends Error {
  constructor(message: string, public fieldErrors: AuthFieldErrors = {}) {
    super(message);
    this.name = "AuthApiError";
  }
}

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

function validationError(body: unknown): AuthApiError {
  const errors: AuthFieldErrors = {};
  if (body && typeof body === "object" && "detail" in body && Array.isArray(body.detail)) {
    for (const issue of body.detail) {
      if (!issue || !Array.isArray(issue.loc)) continue;
      const field = issue.loc[issue.loc.length - 1];
      if (field === "login") errors.login = "Login musi mieć 3–50 znaków: litery, cyfry, _, . lub -.";
      if (field === "email") errors.email = "Podaj poprawny adres e-mail (maksymalnie 254 znaki).";
      if (field === "password") errors.password = "Hasło musi mieć od 8 do 128 znaków.";
      if (issue.msg === "Value error, Email is required for TEACHER") {
        errors.email = "Podaj e-mail nauczyciela.";
      }
    }
  }
  return new AuthApiError("Sprawdź poprawność danych formularza.", errors);
}

// Tylko endpointy auth; token pozostaje w HttpOnly cookie przeglądarki.
async function authRequest(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth${path}`, { ...options, credentials: "include" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AuthApiError("Nie można połączyć się z serwerem. Spróbuj ponownie.");
  }
  if (response.ok || (path === "/me" && response.status === 401)) return response;
  if (response.status === 401) throw new AuthApiError("Nieprawidłowy login lub hasło.");
  if (response.status === 409) throw new AuthApiError("Ten login lub adres e-mail jest już zajęty.");
  if (response.status === 422) throw validationError(await response.json().catch(() => null));
  if (response.status === 403) throw new AuthApiError("Żądanie zostało odrzucone. Odśwież stronę i spróbuj ponownie.");
  throw new AuthApiError("Nie udało się wykonać operacji. Spróbuj ponownie później.");
}

async function readUser(response: Response): Promise<User> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "number" ||
      !("login" in data) || typeof data.login !== "string" ||
      !("email" in data) || (data.email !== null && typeof data.email !== "string") ||
      !("role" in data) || !["STUDENT", "TEACHER", "ADMIN"].includes(String(data.role)) ||
      !("created_at" in data) || typeof data.created_at !== "string") {
    throw new AuthApiError("Nie udało się pobrać danych użytkownika. Spróbuj ponownie.");
  }
  return data as User;
}

function post(data: LoginRequest | RegisterRequest): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

export async function register(data: RegisterRequest): Promise<User> {
  return readUser(await authRequest("/register", post(data)));
}

export async function login(data: LoginRequest): Promise<void> {
  await authRequest("/login", post(data));
}

export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  const response = await authRequest("/me", { signal });
  return response.status === 401 ? null : readUser(response);
}

export async function logout(): Promise<void> {
  await authRequest("/logout", { method: "POST" });
}

export function authErrorMessage(error: unknown): string {
  return error instanceof AuthApiError ? error.message : "Nie udało się wykonać operacji. Spróbuj ponownie.";
}
