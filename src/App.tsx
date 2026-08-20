export default function App() {
  return (
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-10 text-[#24302f] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col justify-between gap-12">
        <header className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5d6c68]">
            Family Board
          </p>
          <span className="rounded-full bg-[#d8e4dc] px-3 py-1 text-xs font-medium text-[#315247]">
            MVP
          </span>
        </header>

        <section className="max-w-xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-[#b06142]">
            A shared page of links
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Keep the useful things close.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#5d6c68]">
            Family Board gives one Editor a simple place to maintain links and
            gives Readers a quiet page to open them.
          </p>
        </section>

        <footer className="border-t border-[#d8d1c5] pt-5 text-sm text-[#75817d]">
          Built for account-free sharing through separate Read and Edit links.
        </footer>
      </div>
    </main>
  );
}
