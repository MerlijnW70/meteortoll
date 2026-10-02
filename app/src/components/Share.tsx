'use client'

import { toast } from 'sonner'

export function Share({ text, url }: { text: string; url?: string }) {
    const link = () => url ?? window.location.href
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link())
            toast.success('Link copied')
        } catch {
            toast.error('Could not copy; copy the address bar instead')
        }
    }
    const tweet = () => {
        const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link())}`
        window.open(intent, '_blank', 'noopener,noreferrer')
    }
    return (
        <div className="flex gap-2">
            <button onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text">
                Copy link
            </button>
            <button onClick={tweet} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text">
                Share on X
            </button>
        </div>
    )
}
