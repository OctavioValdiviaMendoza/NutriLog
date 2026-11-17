"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signup({ name, email, password });
      router.push("/onboarding/goals");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to create account.",
      );
    } finally {
      setLoading(false);
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

        <label
          htmlFor="name"
          className="mb-2 block font-medium text-black"
        >
          Name
        </label>

        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mb-5 w-full rounded-xl border px-4 py-3 text-black"
          required
        />

        <label
          htmlFor="email"
          className="mb-2 block font-medium text-black"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-5 w-full rounded-xl border px-4 py-3 text-black"
          required
        />

        <label
          htmlFor="password"
          className="mb-2 block font-medium text-black"
        >
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-6 w-full rounded-xl border px-4 py-3 text-black"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}
      </form>
    </main>
  );
}
