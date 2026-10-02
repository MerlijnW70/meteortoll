import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-panel p-6 text-center">
            <h1 className="text-lg font-medium">Page not found</h1>
            <p className="text-sm text-muted">The link may be mistyped or out of date.</p>
            <Link href="/" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                See all problems
            </Link>
        </div>
    )
}
