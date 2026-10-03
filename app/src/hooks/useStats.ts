'use client'

import { useQuery } from '@tanstack/react-query'
import { fromJson, type StatsJson } from '@/lib/stats'

async function fetchStats() {
    const response = await fetch('/api/stats')
    if (!response.ok) throw new Error(`stats answered ${response.status}`)
    return fromJson((await response.json()) as StatsJson)
}

export function useStats() {
    return useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000, retry: 1 })
}
