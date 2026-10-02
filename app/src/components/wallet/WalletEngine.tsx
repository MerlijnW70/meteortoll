'use client'

import { memo, useEffect, useMemo } from 'react'
import { useWallet, type WalletContextState, WalletProvider } from '@solana/wallet-adapter-react'
import { useWalletModal, type WalletModalContextState, WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { CLUSTER } from '@/lib/config'
import { DevWalletAdapter } from '@/lib/devWallet'
import { onWalletError, WalletHelp } from '@/components/WalletHelp'

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

function WalletEngine(props: Props) {
    const wallets = useMemo(() => {
        const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        return process.env.NEXT_PUBLIC_DEV_BURNER === '1' && local && CLUSTER !== 'mainnet' ? [new DevWalletAdapter()] : []
    }, [])
    return (
        <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
            <WalletModalProvider>
                <Relay {...props} />
            </WalletModalProvider>
        </WalletProvider>
    )
}

export default memo(WalletEngine)
