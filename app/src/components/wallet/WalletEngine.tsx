'use client'

import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { type WalletName, WalletReadyState } from '@solana/wallet-adapter-base'
import { useWallet, type WalletContextState, WalletProvider } from '@solana/wallet-adapter-react'
import { useWalletModal, WalletModal, WalletModalContext, type WalletModalContextState } from '@solana/wallet-adapter-react-ui'
import { CLUSTER } from '@/lib/config'
import { DevWalletAdapter } from '@/lib/devWallet'
import { isMobile } from '@/lib/walletLinks'
import { onWalletError, WalletHelp } from '@/components/WalletHelp'
import { NoWallet } from './NoWallet'

interface Props {
    open: boolean
    onWallet: (wallet: WalletContextState) => void
    onModal: (modal: WalletModalContextState) => void
}

function Relay({ open, onWallet, onModal }: Props) {
    const { autoConnect, wallets, wallet: current, publicKey, connected, connecting, disconnecting } = useWallet()
    const { select, connect, disconnect, sendTransaction, signTransaction, signAllTransactions, signMessage, signIn } = useWallet()
    const { visible, setVisible } = useWalletModal()
    const wallet = useMemo<WalletContextState>(
        () => ({
            autoConnect, wallets, wallet: current, publicKey, connected, connecting, disconnecting,
            select, connect, disconnect, sendTransaction, signTransaction, signAllTransactions, signMessage, signIn,
        }),
        [autoConnect, wallets, current, publicKey, connected, connecting, disconnecting, select, connect, disconnect, sendTransaction, signTransaction, signAllTransactions, signMessage, signIn]
    )
    const modal = useMemo(() => ({ visible, setVisible }), [visible, setVisible])
    useEffect(() => onWallet(wallet), [wallet, onWallet])
    useEffect(() => onModal(modal), [modal, onModal])
    useEffect(() => {
        if (open) setVisible(true)
    }, [open, setVisible])
    return <WalletHelp />
}

function ModalProvider({ children }: { children: ReactNode }) {
    const [visible, setVisible] = useState(false)
    const { wallets, select } = useWallet()
    const close = useCallback(() => setVisible(false), [])
    const pick = useCallback(
        (name: WalletName) => {
            select(name)
            setVisible(false)
        },
        [select]
    )
    const installed = wallets.some((w) => w.readyState === WalletReadyState.Installed)
    const loadable = wallets.filter((w) => w.readyState === WalletReadyState.Loadable)
    return (
        <WalletModalContext.Provider value={{ visible, setVisible }}>
            {children}
            {visible && (installed || (loadable.length > 0 && !isMobile(navigator.userAgent)) ? <WalletModal /> : <NoWallet onClose={close} onPick={pick} loadable={loadable} />)}
        </WalletModalContext.Provider>
    )
}

function WalletEngine(props: Props) {
    const wallets = useMemo(() => {
        const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        return process.env.NEXT_PUBLIC_DEV_BURNER === '1' && local && CLUSTER !== 'mainnet' ? [new DevWalletAdapter()] : []
    }, [])
    return (
        <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
            <ModalProvider>
                <Relay {...props} />
            </ModalProvider>
        </WalletProvider>
    )
}

export default memo(WalletEngine)
