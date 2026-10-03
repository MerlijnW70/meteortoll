'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { sha256 } from '@noble/hashes/sha256'
import type { ProblemView } from '@/lib/chain'
import { brokenScheme } from '@/lib/checkFile'
import { explorer } from '@/lib/config'
import { recoverScheme } from '@/lib/history'
import { type Progress, sharedVerifier } from '@/lib/verifier'
import { count } from '@/lib/format'
import { errorBoundText } from '@/lib/bound'
import { short, Skeleton } from '../ui'

const FRAMES = 90

function hex(bytes: Uint8Array) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
}

export function VerifierReplay({ problem }: { problem: ProblemView }) {
    const { connection } = useConnection()
    const solver = problem.account.solver?.toBase58()
    const recovered = useQuery({
        queryKey: ['recovered', problem.address, solver],
        enabled: !!solver,
        queryFn: () => recoverScheme(connection, new PublicKey(problem.address), solver!),
        staleTime: Infinity,
    })
    const [state, setState] = useState<Progress | null>(null)
    const [breakIt, setBreakIt] = useState(false)
    const frame = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => {
        if (frame.current) clearTimeout(frame.current)
    }, [])

    if (!solver) return null

    const replay = async () => {
        if (!recovered.data) return
        if (frame.current) clearTimeout(frame.current)
        const verifier = await sharedVerifier()
        const scheme = breakIt ? brokenScheme(recovered.data.scheme) : recovered.data.scheme
        const seed = crypto.getRandomValues(new Uint8Array(32))
        if (!verifier.start(scheme, seed)) return setState(verifier.progress('malformed'))
        const products = scheme[0] ? new DataView(scheme.buffer, scheme.byteOffset).getUint32(3, true) : 0
        const perFrame = Math.max(1, Math.ceil(((products * 30) / FRAMES) | 0))
        const tick = () => {
            const next = verifier.step(perFrame)
            setState(next)
            if (next.verdict === 'running') frame.current = setTimeout(tick, 16)
        }
        tick()
    }

    const done = state && state.verdict !== 'running'
    const running = !!state && state.verdict === 'running'
    const productShare = state ? state.productsDone / Math.max(1, state.rank) : 0
    const tripleShare = state?.directDone ? 1 : 0

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted">The program&apos;s own verifier, compiled to WebAssembly, runs in your browser.</p>
            {recovered.isLoading && <Skeleton className="h-24" />}
            {recovered.data === null && <p className="text-sm text-muted">The winning upload could not be found in this RPC&apos;s history.</p>}
            {recovered.data && (
                <>
                    <dl className="grid gap-1.5 text-xs">
                        <div className="grid grid-cols-[8rem_1fr] gap-2">
                            <dt className="text-muted">Scheme</dt>
                            <dd className="num">
                                {count(recovered.data.scheme.length)} bytes, rebuilt from the solver&apos;s upload transactions to{' '}
                                <a className="font-mono hover:underline" href={explorer('address', recovered.data.submission)} target="_blank" rel="noreferrer">
                                    {short(recovered.data.submission)}
                                </a>
                            </dd>
                        </div>
                        <div className="grid grid-cols-[8rem_1fr] gap-2">
                            <dt className="text-muted">sha256</dt>
                            <dd className="truncate font-mono">{hex(sha256(recovered.data.scheme))}</dd>
                        </div>
                        <div className="grid grid-cols-[8rem_1fr] gap-2">
                            <dt className="text-muted">Commitment</dt>
                            <dd className={recovered.data.matchesCommitment ? 'text-good' : 'text-bad'}>
                                {recovered.data.matchesCommitment
                                    ? '✓ matches the hash the solver staked before the random point existed'
                                    : '✕ does not match the staked commitment'}
                            </dd>
                        </div>
                    </dl>

                    <div className="space-y-3 rounded-lg bg-panel-2 p-4">
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-muted">
                                <span>Scheme side: Σ (u·A)(v·B)(w·G) over {state?.rank ?? '…'} products</span>
                                <span className="num">{state ? `${state.productsDone}/${state.rank}` : ''}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-bg">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${productShare * 100}%` }} />
                            </div>
                            <div className="num mt-1 truncate font-mono text-lg">{state ? state.lhs.toString() : '—'}</div>
                        </div>
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-muted">
                                <span>Direct side: Σ A·B·G over {state ? count(state.triplesTotal) : '…'} triples, as three geometric sums</span>
                                <span className="num">{state ? (state.directDone ? 'done' : 'after the products') : ''}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-bg">
                                <div className="h-full rounded-full bg-accent-2" style={{ width: `${tripleShare * 100}%` }} />
                            </div>
                            <div className="num mt-1 truncate font-mono text-lg">{state ? state.rhs.toString() : '—'}</div>
                        </div>
                        {done && (
                            <p className={`text-sm font-medium ${state.verdict === 'holds' ? 'text-good' : 'text-bad'}`} aria-live="polite">
                                {state.verdict === 'holds'
                                    ? 'Equal mod 2⁶¹−1: the scheme multiplies matrices correctly.'
                                    : breakIt
                                      ? 'Different: one flipped sign is enough to fail, so the check is not a rubber stamp.'
                                      : 'Different: this scheme does not hold.'}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={replay} disabled={running} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50">
                            {running ? 'Checking…' : state ? 'Replay at a new random point' : 'Run the check'}
                        </button>
                        <label className="flex items-center gap-2 text-sm text-muted">
                            <input type="checkbox" checked={breakIt} disabled={running} onChange={(e) => setBreakIt(e.target.checked)} />
                            Break one coefficient
                        </label>
                        <button onClick={() => download(recovered.data!.scheme, `${problem.address.slice(0, 8)}-scheme.bin`)} className="text-sm text-accent hover:underline">
                            Download scheme
                        </button>
                    </div>
                    <p className="text-xs text-faint">
                        Each run draws a fresh random point; the program drew its own from a slot hash after the commitment. A wrong scheme passes a run with
                        probability at most {errorBoundText(problem.account.n1, problem.account.n2, problem.account.n3)}.
                    </p>
                </>
            )}
        </div>
    )
}
