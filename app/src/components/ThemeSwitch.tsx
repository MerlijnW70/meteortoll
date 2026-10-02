'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DEFAULT_THEME, parseChoice, resolveTheme, type Theme, type ThemeChoice, THEME_KEY } from '@/lib/theme'

const LIGHT_QUERY = '(prefers-color-scheme: light)'
const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
    try {
        return parseChoice(localStorage.getItem(THEME_KEY))
    } catch {
        return DEFAULT_THEME
    }
}

function apply() {
    document.documentElement.dataset.theme = resolveTheme(readChoice(), window.matchMedia(LIGHT_QUERY).matches)
    for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    const media = window.matchMedia(LIGHT_QUERY)
    const onStorage = (event: StorageEvent) => event.key === THEME_KEY && apply()
    media.addEventListener('change', apply)
    window.addEventListener('storage', onStorage)
    return () => {
        listeners.delete(listener)
        media.removeEventListener('change', apply)
        window.removeEventListener('storage', onStorage)
    }
}

const snapshot = () => `${readChoice()} ${document.documentElement.dataset.theme ?? 'dark'}`
const serverSnapshot = () => `${DEFAULT_THEME} dark`

export function useTheme(): { choice: ThemeChoice; theme: Theme; choose: (choice: ThemeChoice) => void } {
    const [choice, theme] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(' ') as [ThemeChoice, Theme]
    const choose = (next: ThemeChoice) => {
        try {
            localStorage.setItem(THEME_KEY, next)
        } catch {
            document.documentElement.dataset.theme = resolveTheme(next, window.matchMedia(LIGHT_QUERY).matches)
        }
        apply()
    }
    return { choice, theme, choose }
}

const icon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const OPTIONS: { value: ThemeChoice; label: string; svg: React.ReactNode }[] = [
    {
        value: 'light',
        label: 'Light',
        svg: (
            <svg {...icon} aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
        ),
    },
    {
        value: 'dark',
        label: 'Dark',
        svg: (
            <svg {...icon} aria-hidden>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
        ),
    },
    {
        value: 'system',
        label: 'System',
        svg: (
            <svg {...icon} aria-hidden>
                <rect x="2" y="4" width="20" height="13" rx="2" />
                <path d="M8 21h8M12 17v4" />
            </svg>
        ),
    },
]

export function ThemeSwitch() {
    const { choice, theme, choose } = useTheme()
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const items = useRef<(HTMLButtonElement | null)[]>([])
    const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[2]

    useEffect(() => {
        if (!open) return
        const onPointer = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false)
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            root.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
        }
        document.addEventListener('pointerdown', onPointer)
        document.addEventListener('keydown', onKey)
        items.current[OPTIONS.indexOf(current)]?.focus()
        return () => {
            document.removeEventListener('pointerdown', onPointer)
            document.removeEventListener('keydown', onKey)
        }
    }, [open, current])

    const move = (event: React.KeyboardEvent, index: number) => {
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        if (!step) return
        event.preventDefault()
        items.current[(index + step + OPTIONS.length) % OPTIONS.length]?.focus()
    }

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Theme: ${current.label}${choice === 'system' ? ` (${theme})` : ''}`}
                title="Theme"
                onClick={() => setOpen(!open)}
                className="grid size-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-text aria-expanded:text-text"
            >
                {current.svg}
            </button>
            {open && (
                <div role="menu" aria-label="Theme" className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-border bg-panel p-1 shadow-lg">
                    {OPTIONS.map(({ value, label, svg }, index) => (
                        <button
                            key={value}
                            ref={(element) => {
                                items.current[index] = element
                            }}
                            type="button"
                            role="menuitemradio"
                            aria-checked={choice === value}
                            onClick={() => {
                                choose(value)
                                setOpen(false)
                            }}
                            onKeyDown={(event) => move(event, index)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted outline-none hover:bg-panel-2 hover:text-text focus-visible:bg-panel-2 focus-visible:text-text aria-checked:text-text"
                        >
                            {svg}
                            <span className="flex-1">{label}</span>
                            {choice === value && (
                                <span aria-hidden className="text-accent">
                                    ✓
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
