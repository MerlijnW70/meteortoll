'use client'

import { type ReactNode, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { CheckResult } from '@/components/solve/CheckResult'
import { Dropzone } from '@/components/solve/Dropzone'
import { OpenBounties, SchemeFormat, YourAttempts } from '@/components/solve/Sidebar'
import { SolveFlow } from '@/components/solve/SolveFlow'
import { BOND_SOL } from '@/components/solve/steps'
import { PageIntro, Panel, shape, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { brokenScheme, type Checked, checkFile } from '@/lib/checkFile'
import { sharedVerifier } from '@/lib/verifier'

const SAMPLE = '/samples/7x7x9-rank314.bin'
const SAMPLE_NAME = '7x7x9-rank314.bin'
const SAMPLE_BROKEN_NAME = '7x7x9-rank314-one-sign-flipped.bin'

function address(text: string | null): string | null {
    try {
        return text ? new PublicKey(text).toBase58() : null
    } catch {
        return null
    }
}

const STEPS = 2

function Step({ n, title, active, children }: { n: number; title: string; active: boolean; children: ReactNode }) {
    return (
        <section className={`space-y-4 ${active ? '' : 'opacity-70'}`} aria-label={`Step ${n} of ${STEPS}: ${title}`}>
            <div className="flex items-center gap-3">
                <span
                    aria-hidden
                    className={`num grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${active ? 'bg-accent text-bg' : 'border border-border text-faint'}`}
                >
                    {n}
                </span>
                <div>
                    <p className="text-xs text-muted">
                        Step {n} of {STEPS}
                    </p>
                    <h2 className="text-lg font-medium">{title}</h2>
                </div>
            </div>
            {children}
        </section>
    )
}

function Solve() {
    const [checked, setChecked] = useState<Checked | null>(null)
    const [refusal, setRefusal] = useState<string | null>(null)
    const [sampleError, setSampleError] = useState<string | null>(null)
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

    const resume = address(useSearchParams().get('problem'))
    useEffect(() => {
        sharedVerifier()
    }, [])

    const onFile = async (file: File) => {
        setSampleError(null)
        setRefusal(null)
        setChecked(null)
        setTarget(null)
        try {
            setChecked(await checkFile(file))
        } catch (error) {
            setRefusal(error instanceof Error ? error.message : String(error))
        }
    }

    const trySample = async (broken: boolean) => {
        let file: File
        try {
            const response = await fetch(SAMPLE)
            if (!response.ok) throw new Error(`the server answered ${response.status}`)
            const bytes = new Uint8Array(await response.arrayBuffer())
            file = broken ? new File([Uint8Array.from(brokenScheme(bytes))], SAMPLE_BROKEN_NAME) : new File([bytes], SAMPLE_NAME)
        } catch (error) {
            setChecked(null)
            setRefusal(null)
            setSampleError(error instanceof Error ? error.message : String(error))
            return
        }
        await onFile(file)
    }

    const answers =
        checked && problems
            ? problems.filter((p) => {
                  const h = checked.header
                  return p.account.n1 === h.n1 && p.account.n2 === h.n2 && p.account.n3 === h.n3 && h.rank <= p.account.targetRank && p.phase !== 'solved'
              })
            : []
    const chosen = target ?? (resume && answers.some((p) => p.address === resume) ? resume : null)
    const selected = chosen ? problems?.find((p) => p.address === chosen) : undefined
    const resuming = resume ? problems?.find((p) => p.address === resume) : undefined
    useEffect(() => {
        if (target) document.getElementById('submit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [target])
    const solvedMatch =
        checked && answers.length === 0 && !chosen
            ? problems?.find((p) => {
                  const h = checked.header
                  return p.account.n1 === h.n1 && p.account.n2 === h.n2 && p.account.n3 === h.n3 && h.rank <= p.account.targetRank && p.phase === 'solved' && !p.info.hidden
              })
            : undefined

    const answered = new Set(checked?.result.verdict === 'holds' ? answers.map((p) => p.address) : [])
    return (
        <div className="space-y-6">
            <PageIntro title="Solve">Found a way to multiply matrices with fewer multiplications than the record? Check it here for free, then claim the bounty.</PageIntro>
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
                <div className="space-y-10">
                    <Step n={1} title="Check your scheme" active>
                        {resuming && !selected && resuming.phase !== 'solved' && (
                            <Panel className="border-accent/40 p-4 text-sm">
                                Continuing your attempt on <span className="font-mono">⟨{shape(resuming).label} : ≤{resuming.account.targetRank}⟩</span>. Drop the same
                                scheme file you committed; a different file will not match the commitment.
                            </Panel>
                        )}
                        <Dropzone onFile={onFile} />
                        <p className="text-sm text-muted">
                            No file? Try an example:{' '}
                            <button onClick={() => trySample(false)} className="text-accent hover:underline" title="The team's rank-314 scheme for 7×7×9">
                                a correct one
                            </button>{' '}
                            or{' '}
                            <button onClick={() => trySample(true)} className="text-accent hover:underline" title="The same scheme with one sign flipped">
                                a broken one
                            </button>
                            .{' '}
                            <a href="#scheme-format" className="text-muted underline hover:text-text">
                                What file?
                            </a>
                        </p>
                        {sampleError && (
                            <Panel className="border-bad/40 p-4 text-sm text-bad" role="alert">
                                Could not load the sample scheme: {sampleError}. Try again, or drop a scheme file of your own.
                            </Panel>
                        )}
                        {refusal && (
                            <Panel className="border-bad/40 p-4 text-sm text-bad" role="alert">
                                This file is not a scheme the verifier accepts: {refusal}
                            </Panel>
                        )}
                        {checked && <CheckResult checked={checked} answers={answers} solved={solvedMatch} onSubmit={setTarget} />}
                    </Step>

                    <Step n={2} title="Submit and claim" active={!!(checked && selected)}>
                        {checked && selected ? (
                            <SolveFlow key={selected.address} problem={selected} scheme={checked.scheme} />
                        ) : (
                            <p className="text-sm text-muted">
                                {!checked
                                    ? `Once your scheme checks out, you submit it here in a few wallet approvals, with a ${BOND_SOL} SOL bond you get back.`
                                    : checked.result.verdict !== 'holds'
                                      ? 'This scheme does not hold, so there is nothing to submit. Fix it and check again.'
                                      : answers.length > 0
                                        ? 'Pick the bounty to submit to, above.'
                                        : 'This scheme holds, but no open bounty asks for it.'}
                            </p>
                        )}
                    </Step>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Bounties and help">
                    {publicKey && (
                        <p className="num text-xs text-muted">
                            Solving as <span className="break-all font-mono text-text">{publicKey.toBase58()}</span>
                            {balance.data !== undefined && <> · {sol(balance.data)} SOL</>}. Bounties are paid to this address.
                        </p>
                    )}
                    <YourAttempts />
                    <OpenBounties answers={answered} />
                    <SchemeFormat />
                </aside>
            </div>
        </div>
    )
}

export default function SolvePage() {
    return (
        <Suspense>
            <Solve />
        </Suspense>
    )
}
