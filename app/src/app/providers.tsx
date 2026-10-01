'use client'

import { Buffer } from 'buffer'
import { type ReactNode, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { DevWalletAdapter } from '@/lib/devWallet'
import { Toaster } from 'sonner'
import { rpcEndpoint, WS_ENDPOINT } from '@/lib/config'
import { describeError } from '@/lib/errors'
import { NetworkStatus } from '@/components/NetworkStatus'
import '@solana/wallet-adapter-react-ui/styles.css'

globalThis.Buffer ??= Buffer

export function Providers({ children }: { children: ReactNode }) {
    const [queries] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5_000,
                        refetchOnWindowFocus: false,
                        // Transient failures retry with backoff; a definite answer (an account that does not
                        // exist, a program error) does not get better by asking again.
                        retry: (count, error) => count < 3 && ['network', 'busy', 'expired'].includes(describeError(error).kind),
                        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
                    },
                },
            })
    )
    // A local test key for driving the app in tests; only with the build flag, and only on localhost.
    const wallets = useMemo(() => {
        const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
        return process.env.NEXT_PUBLIC_DEV_BURNER === '1' && local ? [new DevWalletAdapter()] : []
    }, [])
    const [endpoint] = useState(rpcEndpoint)
    return (
        <QueryClientProvider client={queries}>
            <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed', wsEndpoint: WS_ENDPOINT }}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>
                        <NetworkStatus />
                        {children}
                        <Toaster theme="dark" position="bottom-right" richColors />
                    </WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        </QueryClientProvider>
    )
}
