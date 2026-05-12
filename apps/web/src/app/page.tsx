import Image from "next/image";
import {
  Check,
  Code2,
  Download,
  Monitor,
  Sparkles,
  Terminal,
} from "lucide-react";

const capabilities = [
  "Run multiple agents against the same codebase",
  "Review diffs, approvals, and shell output in one place",
  "Keep local sessions, files, and model settings close at hand",
];

const workflow = [
  {
    label: "Open a workspace",
    value: "01",
    detail: "Composer starts from your local project and keeps the working tree visible.",
  },
  {
    label: "Direct the agent",
    value: "02",
    detail: "Ask for implementation, investigation, review, or a focused patch.",
  },
  {
    label: "Ship deliberately",
    value: "03",
    detail: "Inspect the result, approve changes, and move to the next task.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080a0d] text-white">
      <section className="hero-shell relative isolate min-h-[92svh] overflow-hidden">
        <ProductBackdrop />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <a className="flex items-center gap-3" href="#top" aria-label="Composer home">
            <Image
              src="/composer-icon.png"
              alt=""
              width={34}
              height={34}
              className="size-8 rounded"
              priority
            />
            <span className="text-base font-semibold">Composer</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-white/68 md:flex">
            <a href="#workflow" className="transition hover:text-white">
              Workflow
            </a>
            <a href="#desktop" className="transition hover:text-white">
              Desktop
            </a>
            <a href="#download" className="transition hover:text-white">
              Download
            </a>
          </nav>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/16 px-4 text-sm font-medium text-white transition hover:border-white/32 hover:bg-white/8"
            href="#download"
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        </header>

        <div
          id="top"
          className="mx-auto grid min-h-[calc(92svh-80px)] w-full max-w-7xl items-center px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:gap-12"
        >
          <div className="max-w-2xl py-16">
            <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#80f0b4]/26 bg-[#0f1e18]/80 px-3 py-1.5 text-sm font-medium text-[#9ff4c5]">
              <Sparkles className="size-4" aria-hidden="true" />
              Agent-native desktop workspace
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              Composer
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/72">
              A focused desktop surface for steering coding agents through real
              project work: prompts, context, approvals, diffs, and running
              sessions in one place.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#f7f7f2] px-5 text-sm font-semibold text-[#101114] transition hover:bg-white"
                href="#download"
              >
                <Download className="size-4" aria-hidden="true" />
                Get Composer
              </a>
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/16 px-5 text-sm font-semibold text-white transition hover:border-white/32 hover:bg-white/8"
                href="#workflow"
              >
                <Monitor className="size-4" aria-hidden="true" />
                See workflow
              </a>
            </div>
          </div>
          <div className="relative hidden min-h-[640px] lg:block" aria-hidden="true" />
        </div>
      </section>

      <section id="workflow" className="border-t border-white/10 bg-[#101114]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-[#9ff4c5]">
              Workflow
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
              Built around the loop from intent to reviewed change.
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 md:grid-cols-3">
            {workflow.map((item) => (
              <article key={item.value} className="bg-[#101114] p-6">
                <p className="font-mono text-sm text-white/42">{item.value}</p>
                <h3 className="mt-8 text-lg font-semibold">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-white/62">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="desktop" className="bg-[#f4f1e8] text-[#141414]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-[#145c37]">
              Desktop app
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
              Local context stays local while agents do the heavy lifting.
            </h2>
          </div>
          <ul className="grid gap-4">
            {capabilities.map((capability) => (
              <li key={capability} className="flex gap-3 text-base leading-7">
                <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-[#145c37] text-white">
                  <Check className="size-4" aria-hidden="true" />
                </span>
                {capability}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="download" className="bg-[#080a0d]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[#9ff4c5]">
              Composer
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
              Start from the desktop app, then publish the story from the web.
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#f7f7f2] px-5 text-sm font-semibold text-[#101114] transition hover:bg-white"
              href="#"
            >
              <Download className="size-4" aria-hidden="true" />
              Download app
            </a>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/16 px-5 text-sm font-semibold text-white transition hover:border-white/32 hover:bg-white/8"
              href="https://github.com"
            >
              <Code2 className="size-4" aria-hidden="true" />
              View source
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProductBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[#080a0d]" />
      <div className="product-window absolute left-1/2 top-[118px] w-[960px] max-w-none -translate-x-[10%] rounded-lg border border-white/12 bg-[#111318] shadow-[0_28px_90px_rgba(0,0,0,0.55)] max-lg:left-5 max-lg:right-5 max-lg:top-[54%] max-lg:w-auto max-lg:translate-x-0">
        <div className="flex h-10 items-center gap-2 border-b border-white/10 px-4">
          <span className="size-3 rounded-full bg-[#ff6b5f]" />
          <span className="size-3 rounded-full bg-[#f2c14e]" />
          <span className="size-3 rounded-full bg-[#57d68d]" />
          <span className="ml-4 text-xs text-white/40">composer / workspace</span>
        </div>
        <div className="grid h-[560px] grid-cols-[214px_1fr]">
          <aside className="border-r border-white/10 bg-[#0d0f13] p-4">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-white/76">
              <Terminal className="size-4" />
              Sessions
            </div>
            {["Refactor runtime", "Review shell", "Landing page", "Fix build"].map(
              (item, index) => (
                <div
                  key={item}
                  className={[
                    "mb-2 rounded-md px-3 py-2 text-sm",
                    index === 2
                      ? "bg-[#183826] text-[#b6f6ce]"
                      : "bg-white/[0.04] text-white/48",
                  ].join(" ")}
                >
                  {item}
                </div>
              ),
            )}
          </aside>
          <div className="grid grid-rows-[1fr_150px]">
            <div className="p-6">
              <div className="mb-5 h-4 w-40 rounded bg-white/12" />
              <div className="grid gap-4">
                <div className="rounded-lg border border-white/10 bg-[#151920] p-4">
                  <div className="mb-4 h-3 w-28 rounded bg-[#86efac]/70" />
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-white/12" />
                    <div className="h-3 w-10/12 rounded bg-white/10" />
                    <div className="h-3 w-7/12 rounded bg-white/10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-white/10 bg-[#151920] p-4">
                    <div className="h-3 w-20 rounded bg-[#7dd3fc]/70" />
                    <div className="mt-5 h-20 rounded bg-white/[0.06]" />
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#151920] p-4">
                    <div className="h-3 w-24 rounded bg-[#f0abfc]/70" />
                    <div className="mt-5 space-y-2">
                      <div className="h-3 rounded bg-white/10" />
                      <div className="h-3 rounded bg-white/10" />
                      <div className="h-3 w-2/3 rounded bg-white/10" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 bg-[#0b0d11] p-4 font-mono text-xs leading-6 text-white/54">
              <p>$ turbo build --filter=web</p>
              <p className="text-[#9ff4c5]">Tasks: 2 successful, 2 total</p>
              <p>Ready in 4.8s</p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-[#101114]" />
    </div>
  );
}
