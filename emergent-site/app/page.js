'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { Sparkles, Zap, GitMerge, ArrowRight, Github, Twitter, Brain, ChevronDown } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

const Scene3D = dynamic(() => import('@/components/Scene3D'), { ssr: false });

// Local theme-aware logos (white mark for dark bg, black mark for light bg).
const LOGO_DARK = '/logo-white.png';
const LOGO_LIGHT = '/logo-black.png';

function Navbar() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logo = mounted && theme === 'light' ? LOGO_LIGHT : LOGO_DARK;

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-4 inset-x-0 z-50 flex justify-center px-4"
    >
      <div className="glass rounded-2xl px-5 py-3 flex items-center justify-between shadow-2xl w-full max-w-6xl">
        <div className="flex items-center gap-2">
          {mounted && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Nexus LLM" className="h-9 w-9 object-contain" />
          )}
          <span className="font-bold text-lg tracking-tight">Nexus<span className="text-purple-400">LLM</span></span>
        </div>
        <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#fusion" className="hover:text-foreground transition">Fusion</a>
          <a href="#playground" className="hover:text-foreground transition">Playground</a>
          <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-foreground text-background hover:opacity-90 transition">
            Launch <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4">
      <div className="relative z-10 text-center max-w-5xl mx-auto pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-8 text-xs font-medium"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Now with Claude 4.5, GPT-5 &amp; Gemini 2.5</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.95]"
        >
          The <span className="gradient-text">Ultimate</span><br />AI Playground.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
        >
          One interface. Every frontier model. Smart routing, automatic failover,
          and parallel fusion for answers that surpass any single AI.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button className="group inline-flex items-center gap-2 bg-foreground text-background px-7 py-3.5 rounded-full font-semibold hover:scale-105 transition-transform">
            Start Building Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button className="inline-flex items-center gap-2 glass px-7 py-3.5 rounded-full font-semibold hover:scale-105 transition-transform">
            See Models
          </button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="absolute left-1/2 -translate-x-1/2 bottom-[-80px] flex flex-col items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="tracking-widest">SCROLL</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, description, color, badge }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [80, 0, -80]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.75, 1], [0, 1, 1, 0.3]);
  const scale = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0.9, 1, 1, 0.95]);

  return (
    <motion.div ref={ref} style={{ y, opacity, scale }} className="relative">
      <div className="glass rounded-3xl p-8 md:p-12 shadow-2xl overflow-hidden relative group">
        <div className={`absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-30 ${color}`} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </div>
            {badge && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full glass">{badge}</span>
            )}
          </div>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{title}</h3>
          <p className="text-lg text-muted-foreground max-w-2xl">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function PlaygroundPreview() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0.4]);
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -60]);

  return (
    <motion.div ref={ref} style={{ y, opacity }} className="glass rounded-3xl p-6 md:p-10 shadow-2xl">
      <div className="flex items-center gap-2 mb-6">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-muted-foreground font-mono">nexus playground / fusion mode</span>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { name: 'Claude Sonnet 4.5', status: 'streaming', color: 'text-orange-400' },
          { name: 'GPT-5 Turbo', status: 'streaming', color: 'text-emerald-400' },
          { name: 'Gemini 2.5 Pro', status: 'streaming', color: 'text-blue-400' },
        ].map((m, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{m.name}</span>
              <span className={`text-xs ${m.color} flex items-center gap-1`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {m.status}
              </span>
            </div>
            <div className="space-y-1.5">
              {[100, 85, 70, 92, 60].map((w, j) => (
                <div key={j} className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${w}%` }}
                    viewport={{ once: false }}
                    transition={{ duration: 1, delay: i * 0.2 + j * 0.1 }}
                    className="h-full bg-gradient-to-r from-purple-400 to-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 glass rounded-2xl p-5 border-l-4 border-purple-400">
        <div className="flex items-center gap-2 mb-2">
          <GitMerge className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold">Judge Synthesis</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Three responses fused into a single master answer with citations, contradictions resolved, and accuracy boosted by 47%.
        </p>
      </div>
    </motion.div>
  );
}

function App() {
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <main className="relative min-h-screen noise" style={{ zIndex: 1 }}>
      {/* Scroll progress bar */}
      <motion.div
        style={{ scaleX: progressX }}
        className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400 origin-left z-[60]"
      />

      <Scene3D />
      <Navbar />
      <Hero />

      {/* Features Section */}
      <section id="features" className="relative py-32 px-4">
        <div className="max-w-6xl mx-auto space-y-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="text-xs font-semibold tracking-widest text-purple-400 uppercase">Features</span>
            <h2 className="mt-3 text-4xl md:text-6xl font-bold tracking-tighter">Built for the <span className="gradient-text">multi-model</span> era.</h2>
            <p className="mt-5 text-lg text-muted-foreground">Stop bouncing between tabs. Nexus orchestrates every frontier model from one place.</p>
          </motion.div>

          <FeatureCard
            icon={Brain}
            badge="Playground"
            color="bg-purple-500"
            title="Multi-Model Playground"
            description="Chat with Claude 4.5, GPT-5, Gemini 2.5, Llama 4, DeepSeek R2, and every open-source model — side by side, same prompt, same context. Compare reasoning, swap mid-conversation, and see exactly which model thinks like you do."
          />
          <FeatureCard
            icon={Zap}
            badge="Reliability"
            color="bg-emerald-500"
            title="Auto Fallback Chain"
            description="Zero downtime. The moment a model hits a rate limit, errors, or times out, Nexus instantly routes your request to the next model in your chain — preserving context, tools, and streaming. Your app never breaks. Your users never know."
          />
        </div>
      </section>

      {/* Fusion Section */}
      <section id="fusion" className="relative py-32 px-4">
        <div className="max-w-6xl mx-auto space-y-16">
          <FeatureCard
            icon={GitMerge}
            badge="Fusion"
            color="bg-blue-500"
            title="Model Fusion"
            description="Query 3, 5, or 10 models in parallel and let a Judge model synthesize a single master answer. Catch hallucinations through cross-validation, resolve contradictions, and unlock accuracy no single model can deliver."
          />
          <div id="playground">
            <PlaygroundPreview />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative py-24 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { v: '40+', l: 'Frontier Models' },
            { v: '99.99%', l: 'Uptime SLA' },
            { v: '47%', l: 'Accuracy Lift' },
            { v: '120ms', l: 'Median Latency' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass rounded-2xl p-6 text-center"
            >
              <div className="text-4xl md:text-5xl font-bold gradient-text">{s.v}</div>
              <div className="mt-2 text-sm text-muted-foreground">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="relative py-32 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="glass rounded-3xl p-12 md:p-20 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10" />
            <div className="relative z-10">
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter">Unleash every model.<br /><span className="gradient-text">One key. One bill.</span></h2>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">Start free. Scale to millions of requests without re-architecting.</p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <button className="group inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 rounded-full font-semibold hover:scale-105 transition-transform">
                  Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="inline-flex items-center gap-2 glass px-8 py-4 rounded-full font-semibold hover:scale-105 transition-transform">Read Docs</button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border/40 py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">Nexus<span className="text-purple-400">LLM</span></span>
            <span>© 2025</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <a href="#" className="hover:text-foreground transition"><Github className="w-4 h-4" /></a>
            <a href="#" className="hover:text-foreground transition"><Twitter className="w-4 h-4" /></a>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default App;
