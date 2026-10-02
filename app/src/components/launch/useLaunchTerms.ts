'use client'

import { useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { tollReader } from '@/lib/chain'
import { LAUNCHPAD } from '@/lib/config'
import { type LaunchRequest, launchCost, launchTerms, prepareLaunch, statementProblem } from '@/lib/launch'
import { prepare } from '@/lib/solve/send'

export function useLaunchTerms() {
    const { connection } = useConnection()
    return useQuery({
        queryKey: ['launchTerms'],
        queryFn: async () => {
            const terms = await launchTerms(connection, tollReader(connection), LAUNCHPAD)
            return { ...terms, point: await getCurrentPoint(connection, terms.config.activationType) }
        },
        staleTime: 5 * 60_000,
    })
}

function useSettled<T>(value: T, ms: number): T {
    const [settled, setSettled] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms)
        return () => clearTimeout(timer)
    }, [value, ms])
    return settled
}

export function useLaunchCost(request: LaunchRequest | null) {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const key = request && !statementProblem(request) && publicKey ? JSON.stringify({ ...request, firstBuy: request.firstBuy.toString(), owner: publicKey.toBase58() }) : null
    const settled = useSettled(key, 400)
    return useQuery({
        queryKey: ['launchCost', settled],
        enabled: settled !== null && settled === key,
        queryFn: async () => {
            const program = tollReader(connection)
            const prepared = await prepareLaunch(connection, program, LAUNCHPAD, publicKey!, request!, window.location.origin)
            await prepare(connection, [prepared.create, prepared.register], publicKey!)
            return launchCost(connection, program, prepared, publicKey!)
        },
        staleTime: 30_000,
        retry: false,
    })
}
