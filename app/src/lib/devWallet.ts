import {
    BaseSignerWalletAdapter,
    type TransactionOrVersionedTransaction,
    type WalletName,
    WalletNotConnectedError,
    WalletReadyState,
} from '@solana/wallet-adapter-base'
import { Keypair, type PublicKey, Transaction, type TransactionVersion } from '@solana/web3.js'

const STORAGE = 'meteortoll:devWallet'
export const DevWalletName = 'Dev Wallet (local test key)' as WalletName<'Dev Wallet (local test key)'>

const icon =
    'data:image/svg+xml;base64,' +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ffb547"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#0a0b0e" font-family="monospace">dev</text></svg>')

export class DevWalletAdapter extends BaseSignerWalletAdapter<'Dev Wallet (local test key)'> {
    name = DevWalletName
    url = 'https://github.com/'
    icon = icon
    supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0])
    private keypair: Keypair | null = null

    get connecting() {
        return false
    }

    get publicKey(): PublicKey | null {
        return this.keypair?.publicKey ?? null
    }

    get readyState() {
        return typeof window === 'undefined' ? WalletReadyState.Unsupported : WalletReadyState.Loadable
    }

    async connect() {
        let secret: number[] | null = null
        try {
            const stored = localStorage.getItem(STORAGE)
            secret = stored ? (JSON.parse(stored) as number[]) : null
        } catch {
            secret = null
        }
        this.keypair = secret ? Keypair.fromSecretKey(Uint8Array.from(secret)) : Keypair.generate()
        try {
            localStorage.setItem(STORAGE, JSON.stringify(Array.from(this.keypair.secretKey)))
        } catch {
        }
        this.emit('connect', this.keypair.publicKey)
    }

    async disconnect() {
        this.keypair = null
        this.emit('disconnect')
    }

    async signTransaction<T extends TransactionOrVersionedTransaction<this['supportedTransactionVersions']>>(transaction: T): Promise<T> {
        if (!this.keypair) throw new WalletNotConnectedError()
        if (transaction instanceof Transaction) transaction.partialSign(this.keypair)
        else transaction.sign([this.keypair])
        return transaction
    }
}
