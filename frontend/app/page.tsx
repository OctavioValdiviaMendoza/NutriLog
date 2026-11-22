import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-green-50 text-gray-900">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <h1 className="text-2xl font-bold text-green-800">NutriLog</h1>

        <Link
          href="/login"
          className="rounded-full px-5 py-2 font-medium text-green-800 hover:bg-green-100"
        >
          Log in
        </Link>
      </nav>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="mb-4 font-medium text-green-700">
            Nutrition tracking made simpler
          </p>

          <h2 className="mb-6 text-5xl font-bold leading-tight text-green-950">
            Understand what you eat. Reach your goals.
          </h2>

          <p className="mb-8 max-w-xl text-lg leading-8 text-gray-600">
            NutriLog helps you track meals, monitor calories and
            macronutrients, and discover meal ideas that fit your personal
            nutrition goals.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="rounded-full bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
            >
              Create an account
            </Link>

            <Link
              href="/login"
              className="rounded-full border border-green-700 px-6 py-3 font-semibold text-green-800 hover:bg-green-100"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h3 className="mb-6 text-2xl font-semibold text-green-950">
            Track nutrition your way
          </h3>

          <div className="space-y-5">
            <div>
              <h4 className="font-semibold">Manual logging</h4>
              <p className="text-gray-600">
                Search for foods and enter your portions.
              </p>
            </div>

            <div>
              <h4 className="font-semibold">Photo-assisted logging (planned)</h4>
              <p className="text-gray-600">
                Photo-assisted recognition is planned for a future release.
              </p>
            </div>

            <div>
              <h4 className="font-semibold">Personalized insights (planned)</h4>
              <p className="text-gray-600">
                See your progress today; recommendations are planned for a
                future release.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
