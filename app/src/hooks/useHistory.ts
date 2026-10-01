'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { fetchHistory } from '@/lib/history'

/// A problem's history, shared by every component that shows part of it (one fetch per page).
export function useHistory(problem: string) {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['history', problem],
        queryFn: () => fetchHistory(connection, new PublicKey(problem)),
        refetchInterval: 20_000,
    })
}
