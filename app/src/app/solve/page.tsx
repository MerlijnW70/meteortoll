'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { CheckResult } from '@/components/solve/CheckResult'
import { Dropzone } from '@/components/solve/Dropzone'
import { SolveFlow } from '@/components/solve/SolveFlow'
import { Panel, shape, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { type Checked, checkFile } from '@/lib/checkFile'
import { sharedVerifier } from '@/lib/verifier'

function address(text: string | null): string | null {
    try {
        return text ? new PublicKey(text).toBase58() : null
    } catch {
        return null
    }
}

function Solve() {
    const [checked, setChecked] = useState<Checked | null>(null)
    const [refusal, setRefusal] = useState<string | null>(null)
    const [target, setTarget] = useState<string | null>(null)
    const { data: problems } = useProblems()
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const balance = useQuery({
        queryKey: ['balance', publicKey?.toBase58()],
        enabled: !!publicKey,
        queryFn: async () => BigInt(await connection.getBalance(publicKey!)),
        refetchInterval: 10_000,
    })

    // `/solve?problem=<address>` continues an attempt; the portfolio links here.
    const resume = address(useSearchParams().get('problem'))
    useEffect(() => {
        sharedVerifier()
    }, [])

    const onFile = async (file: File) => {
        setRefusal(null)
        setChecked(null)
        setTarget(null)
        try {
            setChecked(await checkFile(file))
        } catch (error) {
            setRefusal(error instanceof Error ? error.message : String(error))
        }
    }

    const answers =
        checked && problems
            ? problems.filter((p) => {
                  const h = checked.header
                  return p.account.n1 === h.n1 && p.account.n2 === h.n2 && p.account.n3 === h.n3 && h.rank <= p.account.targetRank && p.phase !== 'solved'
              })
            : []
    // Look the chosen problem up in the full list, so it stays on screen once it becomes solved.
    // A file that answers the problem being continued goes straight to its submit flow.
    const chosen = target ?? (resume && answers.some((p) => p.address === resume) ? resume : null)
    const selected = chosen ? problems?.find((p) => p.address === chosen) : undefined
    const resuming = resume ? problems?.find((p) => p.address === resume) : undefined

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Solve</h1>
                <p className="mt-1 text-muted">
                    Check a scheme here first. This runs the same verifier the Solana program runs, compiled to WebAssembly, entirely in your browser. Nothing is
                    uploaded until you choose to submit.
                </p>
            </div>
            {publicKey && (
                <p className="num text-xs text-muted">
                    Solving as <span className="break-all font-mono text-text">{publicKey.toBase58()}</span>
                    {balance.data !== undefined && <> · {sol(balance.data)} SOL</>}. Bounties are paid to this address.
                </p>
            )}
            {resuming && !selected && (
                <Panel className="border-accent/40 p-4 text-sm">
                    Continuing your attempt on <span className="font-mono">⟨{shape(resuming).label} : ≤{resuming.account.targetRank}⟩</span>. Drop the same scheme
                    file you committed; a different file will not match the commitment.
                </Panel>
            )}
            <Dropzone onFile={onFile} />
            {refusal && (
                <Panel className="border-bad/40 p-4 text-sm text-bad" role="alert">
                    This file is not a scheme the verifier accepts: {refusal}
                </Panel>
            )}
            {checked && <CheckResult checked={checked} answers={answers} onSubmit={setTarget} />}
            {checked && selected && <SolveFlow key={selected.address} problem={selected} scheme={checked.scheme} />}
        </div>
    )
}

// The query string is only known in the browser, so the page renders below a Suspense boundary.
export default function SolvePage() {
    return (
        <Suspense>
            <Solve />
        </Suspense>
    )
}
