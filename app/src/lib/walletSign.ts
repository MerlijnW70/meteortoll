import { type PublicKey, Transaction } from '@solana/web3.js'
import { CLUSTER } from './config'

export const CHAIN = CLUSTER === 'mainnet' ? 'solana:mainnet' : 'solana:devnet'

interface SignInput {
    account: { address: string }
    transaction: Uint8Array
    chain: string
}

interface StandardWallet {
    accounts: readonly { address: string }[]
    features: Record<string, unknown>
}

type SignFeature = { signTransaction: (...inputs: SignInput[]) => Promise<{ signedTransaction: Uint8Array }[]> }

export function signAllOnChain(
    adapter: unknown,
    owner: PublicKey,
    fallback: (txs: Transaction[]) => Promise<Transaction[]>,
    chain = CHAIN
): (txs: Transaction[]) => Promise<Transaction[]> {
    const standard = (adapter as { standard?: boolean; wallet?: StandardWallet } | null)?.standard ? (adapter as { wallet: StandardWallet }).wallet : null
    const feature = standard?.features['solana:signTransaction'] as SignFeature | undefined
    const account = standard?.accounts.find((a) => a.address === owner.toBase58())
    if (!feature || !account) return fallback
    return async (txs) => {
        const outputs = await feature.signTransaction(
            ...txs.map((tx) => ({ account, chain, transaction: new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false })) }))
        )
        return outputs.map((output) => Transaction.from(output.signedTransaction))
    }
}
