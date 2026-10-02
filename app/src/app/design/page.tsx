'use client'

import Link from 'next/link'
import { SAMPLES } from './_shared'

export default function DesignSamples() {
    return (
        <div className="mx-auto max-w-xl space-y-4 py-10">
            <h1 className="text-2xl font-semibold">Design samples</h1>
            <p className="text-muted">Three directions for the site, each on live devnet data. Pick one; the folder app/src/app/design can then be deleted.</p>
            <ul className="space-y-2">
                {SAMPLES.map(([slug, label]) => (
                    <li key={slug}>
                        <Link href={`/design/${slug}`} className="text-accent hover:underline">
                            {label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}
