import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { REPO_URL } from '@/lib/config'
import { SITE_URL } from '@/lib/server'
import { Providers } from './providers'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    twitter: { card: 'summary_large_image' },
    title: { default: 'meteortoll — open problems you can trade', template: '%s · meteortoll' },
    description:
        'Each token is an open matrix multiplication problem on Meteora DBC. Trading fees fund the bounty; a scheme verified on-chain claims it.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="flex min-h-full flex-col">
                <Providers>
                    <Header />
                    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
                    <footer className="border-t border-border py-6 text-center text-xs text-faint">
                        Built on Meteora Dynamic Bonding Curve · verifier runs on-chain and in your browser ·{' '}
                        <a href={REPO_URL} className="hover:text-text" target="_blank" rel="noreferrer">
                            source on GitHub
                        </a>{' '}
                        ·{' '}
                        <Link href="/terms" className="hover:text-text">
                            terms and risks
                        </Link>
                    </footer>
                </Providers>
            </body>
        </html>
    )
}
