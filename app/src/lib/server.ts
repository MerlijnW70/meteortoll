import { Connection } from '@solana/web3.js'
import { fetchProblem, fetchProblems, type ProblemView } from './chain'
import { describeError } from './errors'
import { failoverFetch, rpcUpstreams } from './upstream'

export function serverConnection(): Connection {
    const urls = rpcUpstreams()
    return new Connection(urls[0], { commitment: 'confirmed', fetch: failoverFetch(urls) })
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meteortoll.vercel.app'

const PROBLEM_TTL_MS = 30_000
const TRANSIENT = ['network', 'busy', 'expired']
const problems = new Map<string, { at: number; value: Promise<ProblemView> }>()

const LIST_TTL_MS = 30_000
let list: { at: number; value: Promise<ProblemView[]> } | null = null

export function serverProblems(now = Date.now()): Promise<ProblemView[]> {
    if (list && now - list.at < LIST_TTL_MS) return list.value
    const value = fetchProblems(serverConnection())
    const entry = { at: now, value }
    list = entry
    value.catch(() => {
        if (list === entry) list = null
    })
    return value
}

export function serverProblem(address: string, now = Date.now()): Promise<ProblemView> {
    const hit = problems.get(address)
    if (hit && now - hit.at < PROBLEM_TTL_MS) return hit.value
    if (problems.size > 5_000) problems.clear()
    const value = fetchProblem(serverConnection(), address)
    problems.set(address, { at: now, value })
    value.catch((error) => {
        if (TRANSIENT.includes(describeError(error).kind)) problems.delete(address)
    })
    return value
}
