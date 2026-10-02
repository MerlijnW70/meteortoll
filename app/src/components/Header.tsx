'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { CLUSTER } from '@/lib/config'
import { ThemeSwitch } from './ThemeSwitch'

const WalletButton = dynamic(() => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton), {
    ssr: false,
    loading: () => <div className="skeleton h-9 w-36" />,
})

const links = [
    ['/', 'Problems'],
    ['/solve', 'Solve'],
    ['/launch', 'Launch'],
    ['/me', 'Portfolio'],
    ['/trust', 'How it works'],
] as const

function Mark() {
    const cells = [14, 27.5, 41]
    return (
        <svg aria-hidden viewBox="0 0 64 64" className="h-6 w-6">
            <rect width="64" height="64" rx="14" fill="var(--accent)" />
            {cells.flatMap((y, r) => cells.map((x, c) => <rect key={`${r}${c}`} x={x} y={y} width="9" height="9" rx="2" fill="var(--bg)" opacity={(r + c) % 2 ? 0.55 : 1} />))}
        </svg>
    )
}

function NavLinks({ className }: { className: string }) {
    const path = usePathname()
    return (
        <nav aria-label="Main" className={className}>
            {links.map(([href, label]) => {
                const active = href === '/' ? path === '/' || path.startsWith('/p/') : path.startsWith(href)
                return (
                    <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={active ? 'text-text' : 'text-muted hover:text-text'}>
                        {label}
                    </Link>
                )
            })}
        </nav>
    )
}

export function Header() {
    return (
        <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                    <Mark />
                    meteortoll
                </Link>
                <NavLinks className="hidden gap-5 text-sm sm:flex" />
                <div className="ml-auto flex items-center gap-3">
                    {CLUSTER !== 'mainnet' && <span className="rounded-md border border-warn/40 px-2 py-0.5 text-xs text-warn">{CLUSTER}</span>}
                    <ThemeSwitch />
                    <WalletButton />
                </div>
            </div>
            <NavLinks className="flex justify-around border-t border-border py-2 text-sm sm:hidden" />
        </header>
    )
}
