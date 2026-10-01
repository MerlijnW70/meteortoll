'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { PublicKey } from '@solana/web3.js'
import { loadMarket } from '@/lib/trade'
import { fetchTrades } from '@/lib/trades'

export function useMarket(pool: PublicKey) {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['market', pool.toBase58()],
        queryFn: () => loadMarket(connection, pool),
        refetchInterval: 8_000,
    })
}

/// The wallet's SOL and its balance of one token.
export function useBalances(owner: PublicKey | null, mint: PublicKey) {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['balances', owner?.toBase58(), mint.toBase58()],
        enabled: !!owner,
        queryFn: async () => {
            const ata = getAssociatedTokenAddressSync(mint, owner!)
            const [lamports, token] = await Promise.all([connection.getBalance(owner!), connection.getTokenAccountBalance(ata).catch(() => null)])
            return { lamports: BigInt(lamports), tokens: token ? BigInt(token.value.amount) : 0n }
        },
        refetchInterval: 10_000,
    })
}

/// The pool's last 100 trades, shared by the trade feed and the market cap chart.
export function useTrades(pool: PublicKey) {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['trades', pool.toBase58()],
        queryFn: () => fetchTrades(connection, pool, 100),
        refetchInterval: 10_000,
    })
}
