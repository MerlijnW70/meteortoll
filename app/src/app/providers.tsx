'use client'

import { Buffer } from 'buffer'
import { type ReactNode, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider } from '@solana/wallet-adapter-react'
import { Toaster } from 'sonner'
import { rpcEndpoint, WS_ENDPOINT } from '@/lib/config'
import { describeError } from '@/lib/errors'
import { sendReport, worthReporting } from '@/lib/report'
import { NetworkStatus } from '@/components/NetworkStatus'
import { WalletLayer } from '@/components/wallet/WalletLayer'
import '@/styles/wallet-adapter.css'

globalThis.Buffer ??= Buffer

const DEV_BURNER = process.env.NEXT_PUBLIC_DEV_BURNER === '1'

function UncaughtErrors() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            const error = event.error ?? event.message
            if (worthReporting(describeError(error).kind)) sendReport('crash', error)
        }
        const onRejection = (event: PromiseRejectionEvent) => {
            if (worthReporting(describeError(event.reason).kind)) sendReport('rejection', event.reason)
        }
        window.addEventListener('error', onError)
        window.addEventListener('unhandledrejection', onRejection)
        return () => {
            window.removeEventListener('error', onError)
            window.removeEventListener('unhandledrejection', onRejection)
        }
    }, [])
    return null
}

export function Providers({ children }: { children: ReactNode }) {
    const [queries] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5_000,
                        refetchOnWindowFocus: false,
                        retry: (count, error) => count < 3 && ['network', 'busy', 'expired'].includes(describeError(error).kind),
                        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
                    },
                },
            })
    )
    const [endpoint] = useState(rpcEndpoint)
    return (
        <QueryClientProvider client={queries}>
            <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed', wsEndpoint: WS_ENDPOINT }}>
                <WalletLayer eager={DEV_BURNER}>
                    <NetworkStatus />
                    <UncaughtErrors />
                    {children}
                    <Toaster theme="dark" position="bottom-right" richColors />
                </WalletLayer>
            </ConnectionProvider>
        </QueryClientProvider>
    )
}
