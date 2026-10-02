'use client'

import { useEffect, useState } from 'react'
import type { WalletError } from '@solana/wallet-adapter-base'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { walletErrorMessage } from '@/lib/walletErrors'

/// After this long without an answer, a connect is most likely waiting on a wallet window the
/// visitor cannot see, or on a locked wallet.
const PATIENCE_MS = 8_000

export function onWalletError(error: WalletError, adapter?: { name: string }) {
    const message = walletErrorMessage(error, adapter?.name)
    if (message) toast.error(message, { id: 'wallet-error' })
}

/// A hint, with a way out, when connecting takes long.
export function WalletHelp() {
    const { connecting, wallet, disconnect } = useWallet()
    const [slow, setSlow] = useState(false)
    useEffect(() => {
        if (!connecting) return
        const timer = setTimeout(() => setSlow(true), PATIENCE_MS)
        return () => {
            clearTimeout(timer)
            setSlow(false)
        }
    }, [connecting])
    if (!connecting || !slow) return null
    const name = wallet?.adapter.name ?? 'your wallet'
    return (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-accent/40 bg-panel p-4 text-sm shadow-lg">
            <p className="font-medium">Waiting for {name}</p>
            <p className="mt-1 text-muted">
                Open the {name} extension: an approval may be waiting there, or the wallet may be locked. Approve the connection to continue.
            </p>
            <button onClick={() => disconnect().catch(() => {})} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text">
                Cancel and pick another wallet
            </button>
        </div>
    )
}
