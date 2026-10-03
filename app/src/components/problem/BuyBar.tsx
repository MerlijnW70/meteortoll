'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cardTitle } from '@/lib/card'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { TradePanel } from './TradePanel'
import { sol } from '../ui'

const SHEET = 'buy-sheet'

export function BuyBar({ problem, watch }: { problem: ProblemView; watch: string }) {
    const [visible, setVisible] = useState(false)
    const [open, setOpen] = useState(false)
    const opener = useRef<HTMLButtonElement>(null)
    const closer = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const target = document.getElementById(watch)
        if (!target) return
        let frame = 0
        const check = () => {
            frame = 0
            setVisible(target.getBoundingClientRect().bottom < 0)
        }
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(check)
        }
        check()
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener('scroll', schedule)
            window.removeEventListener('resize', schedule)
        }
    }, [watch])

    const show = useCallback(() => {
        window.history.pushState({ [SHEET]: true }, '')
        setOpen(true)
    }, [])

    const hide = useCallback(() => {
        if (window.history.state?.[SHEET]) window.history.back()
        else setOpen(false)
    }, [])

    useEffect(() => {
        if (!open) return
        const onPop = () => setOpen(false)
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide()
        window.addEventListener('popstate', onPop)
        window.addEventListener('keydown', onKey)
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        closer.current?.focus()
        const button = opener.current
        return () => {
            window.removeEventListener('popstate', onPop)
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            button?.focus()
        }
    }, [open, hide])

    return (
        <>
            <div
                className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel/95 backdrop-blur transition-transform duration-300 lg:hidden ${visible && !open ? 'translate-y-0' : 'translate-y-full'}`}
                aria-hidden={!visible || open}
                inert={!visible || open}
            >
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{cardTitle(problem.account)}</div>
                        <div className="num text-xs text-muted">
                            {sol(totalBounty(problem), 3)} SOL {problem.phase === 'solved' ? 'prize left' : 'prize'}
                        </div>
                    </div>
                    <button ref={opener} onClick={show} aria-haspopup="dialog" className="shrink-0 rounded-full bg-accent px-7 py-2.5 font-semibold text-bg hover:opacity-90">
                        Buy
                    </button>
                </div>
            </div>
            {open && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/50" onClick={hide} aria-hidden />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Trade ${cardTitle(problem.account)}`}
                        className="sheet-up absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-panel px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
                    >
                        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold tracking-tight">{cardTitle(problem.account)}</h2>
                            <button ref={closer} onClick={hide} className="rounded-full px-3 py-1.5 text-sm text-accent hover:bg-panel-2">
                                Close
                            </button>
                        </div>
                        <TradePanel problem={problem} anchor={false} />
                    </div>
                </div>
            )}
        </>
    )
}
