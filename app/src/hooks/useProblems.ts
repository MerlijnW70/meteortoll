'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { fetchProblem, fetchProblems } from '@/lib/chain'

// A problem's phase moves with the chain (a grace window ends, a solve lands) while a hidden tab
// stops polling, so these refresh the moment someone comes back to the page.
export function useProblems() {
    const { connection } = useConnection()
    return useQuery({ queryKey: ['problems'], queryFn: () => fetchProblems(connection), refetchInterval: 15_000, refetchOnWindowFocus: true })
}

export function useProblem(address: string) {
    const { connection } = useConnection()
    return useQuery({ queryKey: ['problem', address], queryFn: () => fetchProblem(connection, address), refetchInterval: 8_000, refetchOnWindowFocus: true })
}
