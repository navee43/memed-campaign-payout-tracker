import { api, apiData } from "@/lib/api";
import type { Role, User } from "@/types/api";

export const authService = {
  me: () => apiData<{ user: User }>("/auth/me").then((d) => d.user),
  session: () => apiData<{ user: User | null; refreshable: boolean }>("/auth/session"),
  login: (input: { email: string; password: string }) => apiData<{ user: User }>("/auth/login", { method: "POST", body: input }).then((d) => d.user),
  signup: (input: { name: string; email: string; password: string; role: Role }) =>
    apiData<{ user: User }>("/auth/signup", { method: "POST", body: input }).then((d) => d.user),
  logout: () => api<null>("/auth/logout", { method: "POST" }),
  logoutAll: () => api<null>("/auth/logout-all", { method: "POST" }),
  sessions: () =>
    apiData<{ sessions: { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string }[] }>("/auth/sessions").then(
      (d) => d.sessions,
    ),
};
