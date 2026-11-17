"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState("there");

  useEffect(() => {
    getCurrentUser()
      .then((user) => setUserName(user.name))
      .catch(() => router.replace("/login"));
  }, [router]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/");
    }
  }

  return (
    <main className="min-h-screen bg-green-50 px-6 py-10 text-gray-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-700">
              Welcome back, {userName}
            </p>
            <h1 className="text-4xl font-bold text-green-950">NutriLog</h1>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-full bg-green-700 px-5 py-2 font-medium text-white hover:bg-green-800">
              Log a meal
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-green-700 px-5 py-2 font-medium text-green-800 hover:bg-green-100"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-2xl font-semibold">Today&apos;s nutrition</h2>
          <p className="mb-6 text-gray-600">
            Track your progress toward your daily goals.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-orange-50 p-5">
              <p className="text-sm text-gray-600">Calories</p>
              <p className="mt-2 text-3xl font-bold">1,240</p>
              <p className="text-sm text-gray-500">of 2,000 kcal</p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-5">
              <p className="text-sm text-gray-600">Protein</p>
              <p className="mt-2 text-3xl font-bold">72g</p>
              <p className="text-sm text-gray-500">of 140g</p>
            </div>

            <div className="rounded-2xl bg-purple-50 p-5">
              <p className="text-sm text-gray-600">Carbohydrates</p>
              <p className="mt-2 text-3xl font-bold">118g</p>
              <p className="text-sm text-gray-500">of 250g</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Recent meals</h2>

            <div className="space-y-4">
              <div className="flex justify-between border-b pb-3">
                <span>Breakfast</span>
                <span className="text-gray-500">420 kcal</span>
              </div>

              <div className="flex justify-between border-b pb-3">
                <span>Lunch</span>
                <span className="text-gray-500">620 kcal</span>
              </div>

              <div className="flex justify-between">
                <span>Snack</span>
                <span className="text-gray-500">200 kcal</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-green-700 p-6 text-white shadow-sm">
            <h2 className="mb-2 text-xl font-semibold">Need meal ideas?</h2>
            <p className="mb-6 text-green-100">
              Get recommendations based on your remaining nutrition goals.
            </p>

            <button className="rounded-full bg-white px-5 py-2 font-medium text-green-800 hover:bg-green-50">
              View recommendations
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
