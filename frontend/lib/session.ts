import type { User } from "./types";

const STORAGE_KEY = "nutrilog_user";

export function saveUser(user: User) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;

  const storedUser = sessionStorage.getItem(STORAGE_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as User;
  } catch {
    clearUser();
    return null;
  }
}

export function clearUser() {
  sessionStorage.removeItem(STORAGE_KEY);
}
