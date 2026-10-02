'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { WalletNotConnectedError } from '@solana/wallet-adapter-base'
import { WalletContext, type WalletContextState } from '@solana/wallet-adapter-react'
import { WalletModalContext, type WalletModalContextState } from '@solana/wallet-adapter-react-ui'

const WalletEngine = dynamic(() => import('./WalletEngine'), { ssr: false })

const STORAGE_KEY = 'walletName'

export function hasStoredWallet(storage: Pick<Storage, 'getItem'> | undefined): boolean {
    try {
        const value = storage?.getItem(STORAGE_KEY)
        return !!value && JSON.parse(value) !== null
    } catch {
        return false
    }
}

const notConnected = () => Promise.reject(new WalletNotConnectedError())

export function idleWallet(wake: () => void): WalletContextState {
    return {
        autoConnect: false,
        wallets: [],
        wallet: null,
        publicKey: null,
        connecting: false,
        connected: false,
        disconnecting: false,
        select: () => wake(),
        connect: () => {
            wake()
            return notConnected()
        },
        disconnect: () => Promise.resolve(),
        sendTransaction: notConnected,
        signTransaction: undefined,
        signAllTransactions: undefined,
        signMessage: undefined,
        signIn: undefined,
    }
}

const LoadedContext = createContext(false)
export const useWalletLoaded = () => useContext(LoadedContext)

export function WalletLayer({ children, eager }: { children: ReactNode; eager: boolean }) {
    const [load, setLoad] = useState<'idle' | 'quiet' | 'open'>(() =>
        eager || (typeof window !== 'undefined' && hasStoredWallet(window.localStorage)) ? 'quiet' : 'idle'
    )
    const wake = useCallback((open: boolean) => setLoad((now) => (open ? 'open' : now === 'idle' ? 'quiet' : now)), [])

    const idle = useMemo(() => idleWallet(() => wake(true)), [wake])
    const idleModal = useMemo<WalletModalContextState>(() => ({ visible: false, setVisible: (open) => open && wake(true) }), [wake])
    const [wallet, setWallet] = useState<WalletContextState | null>(null)
    const [modal, setModal] = useState<WalletModalContextState | null>(null)

    return (
        <LoadedContext.Provider value={wallet !== null}>
            <WalletContext.Provider value={wallet ?? idle}>
                <WalletModalContext.Provider value={modal ?? idleModal}>
                    {children}
                    {load !== 'idle' && <WalletEngine open={load === 'open'} onWallet={setWallet} onModal={setModal} />}
                </WalletModalContext.Provider>
            </WalletContext.Provider>
        </LoadedContext.Provider>
    )
}
