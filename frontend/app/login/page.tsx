"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Unable to log in.");
      }

      sessionStorage.setItem("nutrilog_user", JSON.stringify(data));
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-green-50 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm"
      >
        <h1 className="mb-2 text-3xl font-bold text-green-950">
          Welcome back
        </h1>

        <p className="mb-8 text-gray-600">
          Log in to view your nutrition dashboard.
        </p>

        <label className="mb-2 block font-medium text-black">Email</label>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          className="mb-5 w-full rounded-xl border px-4 py-3 text-gray-700"
          required
        />

        <label className="mb-2 block font-medium text-black">Password</label>
        <input
          name="password"
          type="password"
          placeholder="Your password"
          className="mb-6 w-full rounded-xl border px-4 py-3 text-gray-700"
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>

        {message && (
          <p className="mt-4 text-center text-sm text-green-700">{message}</p>
        )}
      </form>
    </main>
  );
}
