'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

export interface HowTab {
    id: string
    label: string
    content: ReactNode
}

export function HowTabs({ tabs }: { tabs: HowTab[] }) {
    const [active, setActive] = useState(tabs[0].id)
    const buttons = useRef<(HTMLButtonElement | null)[]>([])

    useEffect(() => {
        const fromHash = () => {
            const id = window.location.hash.slice(1)
            if (tabs.some((tab) => tab.id === id)) setActive(id)
        }
        fromHash()
        window.addEventListener('hashchange', fromHash)
        return () => window.removeEventListener('hashchange', fromHash)
    }, [tabs])

    const open = (id: string, focus = false) => {
        setActive(id)
        window.history.replaceState(null, '', `#${id}`)
        if (focus) buttons.current[tabs.findIndex((tab) => tab.id === id)]?.focus()
    }

    const onKey = (event: React.KeyboardEvent, index: number) => {
        const last = tabs.length - 1
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key]
        if (next === undefined) return
        event.preventDefault()
        open(tabs[(next + tabs.length) % tabs.length].id, true)
    }

    return (
        <div className="space-y-6">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div role="tablist" aria-label="How it works" className="inline-flex min-w-max gap-1 rounded-xl bg-panel-2 p-1">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab.id}
                            ref={(element) => {
                                buttons.current[index] = element
                            }}
                            role="tab"
                            id={`tab-${tab.id}`}
                            aria-selected={active === tab.id}
                            aria-controls={`panel-${tab.id}`}
                            tabIndex={active === tab.id ? 0 : -1}
                            onClick={() => open(tab.id)}
                            onKeyDown={(event) => onKey(event, index)}
                            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                active === tab.id ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            {tabs.map((tab) => (
                <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id}>
                    {tab.content}
                </div>
            ))}
        </div>
    )
}
