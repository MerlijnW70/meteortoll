'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { fetchHistory } from '@/lib/history'

export function useHistory(problem: string) {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['history', problem],
        queryFn: () => fetchHistory(connection, new PublicKey(problem)),
        refetchInterval: 20_000,
    })
}
