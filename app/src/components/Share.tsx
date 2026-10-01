'use client'

import { toast } from 'sonner'

export function Share({ text }: { text: string }) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success('Link copied')
        } catch {
            toast.error('Could not copy; copy the address bar instead')
        }
    }
    const tweet = () => {
        const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`
        window.open(url, '_blank', 'noopener,noreferrer')
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
