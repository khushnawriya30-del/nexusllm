import Link from "next/link";
import { NeuralBackground } from "@/components/landing/NeuralBackground";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero3DLogo } from "@/components/landing/Hero3DLogo";
import { ScrollShowcase } from "@/components/landing/ScrollShowcase";
import { Reveal } from "@/components/landing/Reveal";

const PROVIDERS = [
  "Groq", "Google AI", "NVIDIA NIM", "Mistral", "OpenRouter", "Cerebras",
  "Cohere", "GitHub Models", "Hugging Face", "Z.AI", "Ollama", "OVHcloud",
];

const FEATURES = [
  {
    title: "Auto routing",
    body: "One model id, every fallback. NexusLLM picks the best free model and fails over instantly when a provider is down or rate-limited.",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    title: "Fusion mode",
    body: "Query several models in parallel and let a judge synthesize one sharp answer — multiple minds, a single reply.",
    icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 0v20M2 12h20",
  },
  {
    title: "OpenAI-compatible",
    body: "Drop-in /v1 API. Works with the OpenAI SDKs and any agent — OpenCode, Claude Code, Cursor, Cline — out of the box.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Reasoning, on demand",
    body: "Reasoning-capable models expose a thinking toggle with Low → Max depth, detected from each provider's own catalog.",
    icon: "M12 3a7 7 0 00-4 12.7V18a2 2 0 002 2h4a2 2 0 002-2v-2.3A7 7 0 0012 3z",
  },
  {
    title: "Vision & embeddings",
    body: "Multimodal models accept images; embeddings route within a family. The gateway adapts payloads per provider automatically.",
    icon: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z",
  },
  {
    title: "Bring your own keys",
    body: "Your keys, your account, your limits. Add free provider keys once; NexusLLM unifies them behind a single key you control.",
    icon: "M15 7a4 4 0 11-8 0 4 4 0 018 0zM7 11l-4 4v3h3l4-4",
  },
];

const STATS = [
  { n: "17+", l: "Free providers" },
  { n: "100+", l: "Models unified" },
  { n: "1", l: "Key to rule them" },
  { n: "0", l: "Cost to start" },
];

const BACKEND = "https://nexusllm-3x5q.onrender.com";

export default function LandingPage() {
  return (
    <div className="relative overflow-x-clip">
      <NeuralBackground />
      <LandingNav />

      {/* ---------- HERO ---------- */}
      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-5 pb-20 pt-28 lg:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-secondary/60 px-3.5 py-1.5 text-xs font-medium text-txt-secondary backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-txt-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-txt-primary" />
              </span>
              Free • Self-hosted • OpenAI-compatible
            </div>
            <h1 className="text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Every model.
              <br />
              <span className="bg-gradient-to-r from-txt-primary to-txt-tertiary bg-clip-text text-transparent">
                One key.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-txt-secondary lg:mx-0">
              NexusLLM is a free gateway, manager and chat playground. Point any
              agent at one base URL and key to reach every free LLM — with Auto
              routing and Fusion built in.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/signup"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-txt-primary px-7 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.03]"
              >
                Start free
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-12 items-center rounded-full border border-border bg-bg-secondary/50 px-7 text-sm font-semibold text-txt-primary backdrop-blur transition-colors hover:border-border-hover"
              >
                Read the docs
              </Link>
            </div>
          </div>

          <div className="order-first lg:order-last">
            <Hero3DLogo />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-txt-tertiary">
          <svg className="h-6 w-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </section>

      {/* ---------- PROVIDER STRIP ---------- */}
      <section className="relative border-y border-border bg-bg-secondary/30 py-8 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-txt-tertiary">
            Routes intelligently across
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
            {PROVIDERS.map((p) => (
              <span
                key={p}
                className="rounded-full border border-border bg-bg-primary/40 px-4 py-1.5 text-sm text-txt-secondary"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section id="features" className="relative mx-auto max-w-6xl px-5 py-28 lg:px-8">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-center text-4xl font-bold tracking-tight sm:text-5xl">
            Built like infrastructure.
            <br /> Feels like magic.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-txt-secondary">
            Everything you need to ship on free models — reliability, speed and
            intelligence, wired into one gateway.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <div className="group h-full rounded-3xl border border-border bg-bg-secondary/40 p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-border-hover">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-bg-primary/50 text-txt-primary transition-colors group-hover:bg-txt-primary group-hover:text-bg-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                    <path d={f.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-txt-secondary">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- APPLE-STYLE PINNED SHOWCASE ---------- */}
      <ScrollShowcase />

      {/* ---------- HOW IT WORKS ---------- */}
      <section id="how" className="relative mx-auto max-w-6xl px-5 py-28 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Three lines to live.
            </h2>
            <p className="mt-4 max-w-md text-txt-secondary">
              NexusLLM speaks the OpenAI API. Set the base URL and your key in
              any SDK or agent — the model id <code className="rounded bg-bg-tertiary/60 px-1.5 py-0.5 font-mono text-sm">auto</code> just works.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["Add free provider keys", "Groq, Google, NVIDIA, Mistral and more — once, in the Keys page."],
                ["Copy your unified key", "One key fronts them all. Rotate or revoke anytime."],
                ["Connect any agent", "OpenCode, Claude Code, Cursor, Cline — paste base URL + key."],
              ].map(([h, d], i) => (
                <li key={h} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-txt-primary text-sm font-bold text-bg-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{h}</p>
                    <p className="text-sm text-txt-secondary">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-2xl border border-border bg-[#0b0b12] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-white/20" />
                <span className="h-3 w-3 rounded-full bg-white/20" />
                <span className="h-3 w-3 rounded-full bg-white/20" />
                <span className="ml-2 font-mono text-xs text-white/40">quickstart.py</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-white/90">
                <code>{`from openai import OpenAI

client = OpenAI(
    base_url="${BACKEND}/v1",
    api_key="YOUR_NEXUS_KEY",
)

resp = client.chat.completions.create(
    model="auto",          # or "fusion", or any model id
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`}</code>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- STATS ---------- */}
      <section className="relative border-y border-border bg-bg-secondary/30 py-16 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-5 sm:grid-cols-4 lg:px-8">
          {STATS.map((s) => (
            <Reveal key={s.l} className="text-center">
              <div className="text-4xl font-bold tracking-tight sm:text-5xl">{s.n}</div>
              <div className="mt-2 text-sm text-txt-secondary">{s.l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="relative mx-auto max-w-4xl px-5 py-32 text-center lg:px-8">
        <Reveal>
          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Start building on free models today.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-txt-secondary">
            No credit card. No lock-in. Self-host it, or use your own keys —
            you stay in control.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center rounded-full bg-txt-primary px-8 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.03]"
            >
              Create your account
            </Link>
            <a
              href="/downloads/nexusllm.apk"
              download
              className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-bg-secondary/50 px-8 text-sm font-semibold text-txt-primary backdrop-blur transition-colors hover:border-border-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Download Android app
            </a>
          </div>
        </Reveal>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="relative border-t border-border bg-bg-secondary/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row lg:px-8">
          <div className="flex items-center gap-2">
            {/* eslint-disable @next/next/no-img-element */}
            <img src="/logo-black.png" alt="NexusLLM" className="block h-7 w-7 object-contain dark:hidden" />
            <img src="/logo-white.png" alt="NexusLLM" className="hidden h-7 w-7 object-contain dark:block" />
            {/* eslint-enable @next/next/no-img-element */}
            <span className="font-bold">NexusLLM</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-txt-secondary">
            <Link href="/docs" className="hover:text-txt-primary">Docs</Link>
            <Link href="/models" className="hover:text-txt-primary">Models</Link>
            <Link href="/chat" className="hover:text-txt-primary">Chat</Link>
            <Link href="/playground" className="hover:text-txt-primary">Playground</Link>
            <Link href="/login" className="hover:text-txt-primary">Log in</Link>
            <a href="https://github.com/khushnawriya30-del/nexusllm" className="hover:text-txt-primary">GitHub</a>
          </nav>
          <p className="text-xs text-txt-tertiary">© {new Date().getFullYear()} NexusLLM</p>
        </div>
      </footer>
    </div>
  );
}
