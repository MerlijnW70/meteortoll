import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import { Analytics } from '@vercel/analytics/next'
import { Header } from '@/components/Header'
import { REPO_URL } from '@/lib/config'
import { SITE_URL } from '@/lib/server'
import { THEME_BOOT } from '@/lib/theme'
import { Providers } from './providers'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    twitter: { card: 'summary_large_image' },
    title: { default: 'meteortoll — open problems you can trade', template: '%s · meteortoll' },
    description:
        'Each token is an open matrix multiplication problem on Meteora DBC. Trading fees fund the prize; a scheme verified on-chain claims it.',
}

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
        { media: '(prefers-color-scheme: dark)', color: '#0a0b0e' },
    ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
            </head>
            <body className="flex min-h-full flex-col">
                <Providers>
                    <Header />
                    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
                    <footer className="border-t border-border py-6 text-center text-xs text-faint">
                        <p>
                        Built on Meteora Dynamic Bonding Curve · verifier runs on-chain and in your browser ·{' '}
                        <a href={REPO_URL} className="hover:text-text" target="_blank" rel="noreferrer">
                            source on GitHub
                        </a>{' '}
                        ·{' '}
                        <Link href="/terms" className="hover:text-text">
                            terms and risks
                        </Link>
                        </p>
                    </footer>
                </Providers>
                {process.env.VERCEL === '1' && <Analytics />}
            </body>
        </html>
    )
}
