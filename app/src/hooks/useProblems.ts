'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { fetchProblem, fetchProblems } from '@/lib/chain'

export function useProblems() {
    const { connection } = useConnection()
    return useQuery({ queryKey: ['problems'], queryFn: () => fetchProblems(connection), refetchInterval: 15_000 })
}

export function useProblem(address: string) {
    const { connection } = useConnection()
    return useQuery({ queryKey: ['problem', address], queryFn: () => fetchProblem(connection, address), refetchInterval: 8_000 })
}
