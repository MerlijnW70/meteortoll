'use client'

import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
    window.addEventListener('online', notify)
    window.addEventListener('offline', notify)
    return () => {
        window.removeEventListener('online', notify)
        window.removeEventListener('offline', notify)
    }
}

export function NetworkStatus() {
    const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
    if (online) return null
    return (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-warn px-4 py-2 text-center text-sm font-medium text-bg">
            You are offline. Prices, bounties and transactions will update when the connection returns.
        </div>
    )
}
