import type { Metadata } from 'next'
import { Bricolage_Grotesque, Newsreader } from 'next/font/google'

// Design samples: three directions for the site, on live data. Everything lives in this folder;
// deleting it removes them without touching the rest of the app.

const serif = Newsreader({ variable: '--font-serif', subsets: ['latin'], style: ['normal', 'italic'] })
const display = Bricolage_Grotesque({ variable: '--font-display', subsets: ['latin'] })

export const metadata: Metadata = { title: 'Design samples', robots: { index: false, follow: false } }

export default function Layout({ children }: { children: React.ReactNode }) {
    return <div className={`${serif.variable} ${display.variable}`}>{children}</div>
}
