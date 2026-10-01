'use client'

import { useMemo, useState } from 'react'
import { combine, ENTRIES, type Grid, random, schoolbook, strassen } from '@/lib/strassen'

function Matrix({ label, grid }: { label: string; grid: Grid }) {
    return (
        <div className="text-center">
            <div className="mb-1 text-xs text-muted">{label}</div>
            <div className="num grid grid-cols-2 gap-1 rounded-lg border border-border p-2 font-mono text-sm">
                {grid.flat().map((v, i) => (
                    <span key={i} className="w-9 rounded bg-panel-2 py-1">
                        {v}
                    </span>
                ))}
            </div>
        </div>
    )
}

export function Strassen() {
    const [method, setMethod] = useState<'schoolbook' | 'strassen'>('schoolbook')
    const [selected, setSelected] = useState<string | null>(null)
    const [pair, setPair] = useState<[Grid, Grid]>(() => [
        [
            [3, -1],
            [2, 4],
        ],
        [
            [5, 2],
            [-3, 1],
        ],
    ])
    const products = method === 'schoolbook' ? schoolbook : strassen
    const [a, b] = pair
    const result = useMemo(() => combine(products, a, b), [products, a, b])
    const truth = useMemo(() => combine(schoolbook, a, b), [a, b])
    const active = products.find((p) => p.name === selected)
    const agrees = ENTRIES.every((entry) => result[entry] === truth[entry])

    return (
        <section className="space-y-4 rounded-xl border border-border bg-panel p-5" aria-labelledby="strassen-title">
            <div>
                <h2 id="strassen-title" className="font-medium">
                    Why one multiplication matters
                </h2>
                <p className="mt-1 text-sm text-muted">
                    Multiplying two 2×2 matrices the schoolbook way takes 8 multiplications. In 1969 Volker Strassen found a way with 7. Pick a product to see
                    which entries of the result use it.
                </p>
            </div>
            <div role="radiogroup" aria-label="Method" className="inline-grid grid-cols-2 rounded-lg bg-panel-2 p-1 text-sm">
                {(['schoolbook', 'strassen'] as const).map((m) => (
                    <button
                        key={m}
                        role="radio"
                        aria-checked={method === m}
                        onClick={() => {
                            setMethod(m)
                            setSelected(null)
                        }}
                        className={`rounded-md px-3 py-1.5 ${method === m ? 'bg-accent/25 text-text' : 'text-muted'}`}
                    >
                        {m === 'schoolbook' ? 'Schoolbook · 8' : 'Strassen · 7'}
                    </button>
                ))}
            </div>
            <div className="grid gap-5 md:grid-cols-[1fr_auto]">
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {products.map((product) => (
                        <li key={product.name}>
                            <button
                                onClick={() => setSelected(selected === product.name ? null : product.name)}
                                aria-pressed={selected === product.name}
                                className={`flex w-full items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left font-mono text-xs ${
                                    selected === product.name ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
                                }`}
                            >
                                <span>
                                    {product.name} = {product.formula}
                                </span>
                                <span className="num text-muted">{product.value(a, b)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="flex items-start justify-center gap-3">
                    <Matrix label="A" grid={a} />
                    <span className="pt-8 text-muted">×</span>
                    <Matrix label="B" grid={b} />
                    <span className="pt-8 text-muted">=</span>
                    <div className="text-center">
                        <div className="mb-1 text-xs text-muted">C</div>
                        <div className="num grid grid-cols-2 gap-1 rounded-lg border border-border p-2 font-mono text-sm">
                            {ENTRIES.map((entry) => {
                                const sign = active?.uses[entry]
                                return (
                                    <span
                                        key={entry}
                                        className={`w-11 rounded py-1 ${sign === 1 ? 'bg-good/25' : sign === -1 ? 'bg-bad/25' : 'bg-panel-2'}`}
                                        title={sign ? `${entry} ${sign === 1 ? 'adds' : 'subtracts'} ${active?.name}` : entry}
                                    >
                                        {result[entry]}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={agrees ? 'text-good' : 'text-bad'} aria-live="polite">
                    {agrees ? `✓ ${products.length} multiplications, same answer as schoolbook` : 'Different answer'}
                </span>
                <button onClick={() => setPair([random(), random()])} className="rounded-lg border border-border px-3 py-1 text-xs hover:border-accent/60">
                    Try random numbers
                </button>
            </div>
            <p className="text-sm text-muted">
                Saving one multiplication sounds small, but applied recursively to big matrices it turns n³ work into about n<sup>2.81</sup>. Every problem on
                meteortoll asks the same question for a larger shape: can you do it with one multiplication fewer than anyone has published?
            </p>
        </section>
    )
}
