const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

// Auth remains in the browser's HttpOnly cookie for every API request.
export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...options, credentials: "include" });
}
