import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import "./premium-ui.css";
import { Providers } from "./providers";
import { SiteChrome } from "@/components/ui/SiteChrome";
import { AmbientBackdrop } from "@/components/ui/AmbientBackdrop";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "NexusLLM — Every model. One key. One gateway.",
  description:
    "NexusLLM is a free, self-hosted OpenAI-compatible gateway, manager and chat playground. One base URL + key gives any agent every free model, with Auto routing and Fusion.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>
          <AmbientBackdrop />
          <SiteChrome />
          <main className="relative z-10 min-h-[calc(100vh-3.5rem)]">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
