import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a className="flex items-center gap-3" href="/" aria-label="Composer home">
          <Image
            src="/composer-icon.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-md"
            priority
          />
          <span className="text-base font-semibold tracking-tight">Composer</span>
        </a>
        <a
          className="inline-flex h-10 items-center justify-center rounded-full bg-[#172033] px-5 text-sm font-medium text-white transition hover:bg-[#2a354c]"
          href="/api/download"
          aria-label="Download Composer for your current platform"
        >
          Download
        </a>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Build with agents in Composer.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#657188] sm:text-lg">
          A focused desktop workspace for running coding sessions, reviewing
          changes, and keeping project context in one place.
        </p>

        <Image
          src="/composer-session.png"
          alt="Composer desktop thread session"
          width={3104}
          height={2024}
          className="mt-12 h-auto w-full"
          priority
          unoptimized
        />
      </section>

      <footer className="border-t border-[#d8dee8]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-[#657188] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Composer</span>
          <a className="transition hover:text-[#172033]" href="/api/download">
            Download for desktop
          </a>
        </div>
      </footer>
    </main>
  );
}
