'use client'

import { useEffect } from 'react'
import { sendReport } from '@/lib/report'

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => sendReport('render', error), [error])
    return (
        <html lang="en">
            <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0b0e', color: '#e8eaee', fontFamily: 'system-ui, sans-serif' }}>
                <title>meteortoll — something went wrong</title>
                <main role="alert" style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 600 }}>meteortoll could not start</h1>
                    <p style={{ color: '#8a92a0' }}>Reload to try again. Your funds and attempts are on-chain and unaffected.</p>
                    {error.digest && <p style={{ color: '#7a8290', fontFamily: 'monospace', fontSize: 12 }}>reference {error.digest}</p>}
                    <button onClick={() => retry()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: 0, background: '#8b7cff', color: '#0a0b0e', fontWeight: 600, cursor: 'pointer' }}>
                        Try again
                    </button>
                </main>
            </body>
        </html>
    )
}
