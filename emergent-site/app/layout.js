import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'Nexus LLM — The Ultimate AI Playground',
  description: 'Multi-Model AI Playground & Aggregator with Auto Fallback Chains and Model Fusion.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
