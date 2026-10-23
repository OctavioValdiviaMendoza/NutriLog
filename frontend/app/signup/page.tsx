"use client";

import { FormEvent, useState } from "react";

export default function SignupPage() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    try {
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Unable to create your account.");
      }

      setMessage(`Account created for ${data.name}.`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create your account.");
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
          Create your account
        </h1>

        <p className="mb-8 text-gray-600">
          Start tracking your nutrition with NutriLog.
        </p>

        <label className="mb-2 block font-medium text-black">Name</label>
        <input
          name="name"
          type="text"
          placeholder="Your name"
          className="mb-5 w-full rounded-xl border px-4 py-3 text-gray-700"
          required
        />

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
          placeholder="Create a password"
          className="mb-6 w-full rounded-xl border px-4 py-3 text-gray-700"
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>

        {message && (
          <p className="mt-4 text-center text-sm text-green-700">{message}</p>
        )}
      </form>
    </main>
  );
}
