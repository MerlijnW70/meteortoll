'use client'

import { useEffect, useRef } from 'react'
import type { WalletName } from '@solana/wallet-adapter-base'
import type { Wallet } from '@solana/wallet-adapter-react'
import { INSTALL_LINKS, isMobile, openInLinks } from '@/lib/walletLinks'
import { BUTTON, BUTTON_QUIET } from '@/components/ui'

interface Props {
    onClose: () => void
    onPick: (name: WalletName) => void
    loadable: Wallet[]
}

export function NoWallet({ onClose, onPick, loadable }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const mobile = isMobile(navigator.userAgent)
    const openIn = openInLinks(window.location.href)

    useEffect(() => {
        ref.current?.focus()
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby="no-wallet-title"
                tabIndex={-1}
                className="w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-xl outline-none"
            >
                <div className="flex items-start justify-between gap-4">
                    <h2 id="no-wallet-title" className="text-xl font-semibold tracking-tight">
                        You need a Solana wallet
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="-m-1 rounded-full p-1 text-muted hover:text-text">
                        ✕
                    </button>
                </div>

                {mobile ? (
                    <>
                        <p className="mt-2 text-sm text-muted">Phone browsers can&apos;t reach a wallet directly. Open this page inside your wallet app instead.</p>
                        <div className="mt-4 grid gap-2">
                            {openIn.map((link) => (
                                <a key={link.name} href={link.href} className={BUTTON}>
                                    Open in {link.name}
                                </a>
                            ))}
                            {loadable.map((wallet) => (
                                <button key={wallet.adapter.name} onClick={() => onPick(wallet.adapter.name)} className={BUTTON_QUIET}>
                                    Use a wallet app on this phone
                                </button>
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-muted">
                            No wallet app yet? Get{' '}
                            {INSTALL_LINKS.map((link, i) => (
                                <span key={link.name}>
                                    {i > 0 && (i === INSTALL_LINKS.length - 1 ? ' or ' : ', ')}
                                    <a href={link.href} target="_blank" rel="noreferrer" className="underline hover:text-text">
                                        {link.name}
                                    </a>
                                </span>
                            ))}
                            .
                        </p>
                    </>
                ) : (
                    <>
                        <p className="mt-2 text-sm text-muted">No wallet was found in this browser. Install one, then reload this page.</p>
                        <div className="mt-4 grid gap-2">
                            {INSTALL_LINKS.map((link) => (
                                <a key={link.name} href={link.href} target="_blank" rel="noreferrer" className={BUTTON_QUIET}>
                                    Install {link.name}
                                </a>
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-muted">In MetaMask, turn on the Solana network. Already installed? Unlock it and reload.</p>
                        <button onClick={() => window.location.reload()} className={`${BUTTON} mt-4 w-full`}>
                            Reload
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
