import type { WalletError } from '@solana/wallet-adapter-base'

const SIGNING = new Set(['WalletSignTransactionError', 'WalletSendTransactionError', 'WalletSignMessageError'])

export function walletErrorMessage(error: Pick<WalletError, 'name' | 'message'>, wallet?: string): string | null {
    if (SIGNING.has(error.name)) return null
    const name = wallet ?? 'your wallet'
    const text = `${error.name} ${error.message}`.toLowerCase()
    if (/reject|denied|declined|cancel/.test(text)) return `The connection was declined in ${name}.`
    if (error.name === 'WalletNotReadyError') return `${name} is not available in this browser. Install it or pick another wallet.`
    if (/lock/.test(text)) return `${name} is locked. Unlock it and connect again.`
    if (error.name === 'WalletAccountError')
        return `${name} did not share a Solana account. Make sure it has a Solana account (in MetaMask: the Solana network is enabled), then connect again.`
    if (/timed? ?out|timeout/.test(text)) return `${name} did not answer in time. Open ${name}, approve the request there, and connect again.`
    if (error.name === 'WalletWindowClosedError') return `The ${name} window was closed before connecting.`
    if (error.name === 'WalletDisconnectedError') return null
    return `Could not connect ${name}: ${error.message || error.name}`
}
