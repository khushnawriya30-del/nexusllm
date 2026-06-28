import Link from "next/link";
import { LandingNav } from "@/components/landing/LandingNav";

export const metadata = {
  title: "Docs — NexusLLM",
  description: "Connect any OpenAI-compatible agent to NexusLLM: base URL, keys, models, and agent setup (OpenCode, Claude Code, Cursor, Cline).",
};

const BACKEND = "https://nexusllm-3x5q.onrender.com";

function Code({ children }: { children: string }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-xl border border-border bg-[#0b0b12] p-4 font-mono text-[13px] leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-10 first:border-t-0">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-txt-secondary">{children}</div>
    </section>
  );
}

const FAQ = [
  ["Is it really free?", "Yes. NexusLLM unifies free-tier providers (Groq, Google AI Studio, NVIDIA NIM, Mistral, OpenRouter free models, and more). You bring free keys; the gateway routes across them. Self-hosting is free too."],
  ["Do other users share my key or limits?", "No. Each deployment uses its own provider keys and its own unified key. Your usage and rate limits are yours alone."],
  ["What are 'auto' and 'fusion'?", "auto routes to the best available model and fails over automatically. fusion queries several models in parallel and synthesizes one answer via a judge model."],
  ["Which clients work?", "Anything that speaks the OpenAI API: the official OpenAI SDKs, OpenCode, Claude Code, Cursor, Cline, Continue, and most agent frameworks. Just set the base URL and key."],
  ["Does reasoning / thinking work?", "Yes. Reasoning-capable models expose a thinking control (Low → Max). The gateway detects reasoning support from each provider's own model catalog and maps intensity to the right parameters."],
  ["Is there a mobile app?", "Yes — a ChatGPT-style Android app. Download it from the home page and connect it with your own base URL + key."],
];

export default function DocsPage() {
  return (
    <div className="relative min-h-screen">
      <LandingNav />
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-28 lg:px-8">
        <Link href="/" className="text-sm text-txt-secondary hover:text-txt-primary">← Back to home</Link>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Documentation</h1>
        <p className="mt-3 text-lg text-txt-secondary">
          Connect any OpenAI-compatible client to NexusLLM in minutes.
        </p>

        <Section id="quickstart" title="Quickstart">
          <p>NexusLLM exposes an OpenAI-compatible API. Use these two values everywhere:</p>
          <Code>{`Base URL:  ${BACKEND}/v1
API Key:   YOUR_NEXUS_KEY   (create one on the Keys page)`}</Code>
          <p>Python (official OpenAI SDK):</p>
          <Code>{`from openai import OpenAI

client = OpenAI(
    base_url="${BACKEND}/v1",
    api_key="YOUR_NEXUS_KEY",
)

resp = client.chat.completions.create(
    model="auto",                       # or "fusion", or any model id
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`}</Code>
          <p>cURL:</p>
          <Code>{`curl ${BACKEND}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_NEXUS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hi"}]}'`}</Code>
        </Section>

        <Section id="keys" title="Getting your key">
          <p>
            Open the <Link href="/keys" className="text-txt-primary underline">Keys page</Link>,
            add free provider keys (Groq, Google AI Studio, NVIDIA NIM, Mistral, OpenRouter…),
            then copy your unified key. That one key fronts every provider you added.
          </p>
          <p>List everything your key can reach:</p>
          <Code>{`curl ${BACKEND}/v1/models -H "Authorization: Bearer YOUR_NEXUS_KEY"`}</Code>
        </Section>

        <Section id="models" title="Models, Auto & Fusion">
          <p>Use any concrete model id, or one of the two special routing modes:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><code className="rounded bg-bg-tertiary/60 px-1.5 py-0.5 font-mono text-sm">auto</code> — routes to the best available model and fails over instantly on errors or rate limits.</li>
            <li><code className="rounded bg-bg-tertiary/60 px-1.5 py-0.5 font-mono text-sm">fusion</code> — runs several models in parallel and synthesizes one answer.</li>
          </ul>
          <p>Both appear in <code className="rounded bg-bg-tertiary/60 px-1.5 py-0.5 font-mono text-sm">/v1/models</code> so agents can list and select them like any other model.</p>
        </Section>

        <Section id="agents" title="Connecting agents">
          <p><strong className="text-txt-primary">OpenCode / Cline / Continue / Cursor</strong> — choose a custom OpenAI-compatible provider and set:</p>
          <Code>{`Base URL:  ${BACKEND}/v1
API Key:   YOUR_NEXUS_KEY
Model:     auto        (or any id from /v1/models)`}</Code>
          <p><strong className="text-txt-primary">Claude Code / Codex-style tools</strong> — set the OpenAI base URL + key via environment variables:</p>
          <Code>{`export OPENAI_BASE_URL="${BACKEND}/v1"
export OPENAI_API_KEY="YOUR_NEXUS_KEY"`}</Code>
          <p>Then pick <code className="rounded bg-bg-tertiary/60 px-1.5 py-0.5 font-mono text-sm">auto</code> as the model and start prompting. Auto and Fusion work inside agents too.</p>
        </Section>

        <Section id="app" title="Android app">
          <p>
            Prefer mobile? Grab the ChatGPT-style Android app and connect it with the
            same base URL + key.
          </p>
          <p>
            <a href="/downloads/nexusllm.apk" download className="text-txt-primary underline">
              Download the NexusLLM Android app (.apk)
            </a>
          </p>
        </Section>

        <Section id="faq" title="FAQ">
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-secondary/40">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium text-txt-primary">
                  {q}
                  <span className="ml-4 text-txt-tertiary transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pb-4 text-[15px] leading-relaxed text-txt-secondary">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/signup" className="inline-flex h-11 items-center rounded-full bg-txt-primary px-6 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.03]">
            Create account
          </Link>
          <Link href="/chat" className="inline-flex h-11 items-center rounded-full border border-border bg-bg-secondary/50 px-6 text-sm font-semibold text-txt-primary transition-colors hover:border-border-hover">
            Open the playground
          </Link>
        </div>
      </div>
    </div>
  );
}
