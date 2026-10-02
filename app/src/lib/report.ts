import type { ErrorKind } from './errors'

export type ReportKind = 'crash' | 'rejection' | 'render' | 'action'

export interface Report {
    kind: ReportKind
    message: string
    stack: string
    path: string
    release: string
    cluster: string
}

export const LIMITS = { message: 500, stack: 4_000, field: 80, body: 8 * 1024, perPage: 10 }

export function worthReporting(kind: ErrorKind): boolean {
    return kind === 'program' || kind === 'unknown'
}

export function scrub(text: string): string {
    return text.replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, '[redacted]').replace(/\[\s*\d{1,3}(\s*,\s*\d{1,3}){31,}\s*\]/g, '[redacted]')
}

const clip = (value: unknown, max: number) => scrub(typeof value === 'string' ? value : '').slice(0, max)

export function cleanReport(input: unknown): Report | null {
    if (!input || typeof input !== 'object') return null
    const raw = input as Record<string, unknown>
    const kinds: ReportKind[] = ['crash', 'rejection', 'render', 'action']
    if (!kinds.includes(raw.kind as ReportKind)) return null
    const message = clip(raw.message, LIMITS.message)
    if (!message) return null
    const path = clip(raw.path, LIMITS.field).split(/[?#]/)[0]
    return {
        kind: raw.kind as ReportKind,
        message,
        stack: clip(raw.stack, LIMITS.stack),
        path: path.startsWith('/') ? path : '/',
        release: clip(raw.release, LIMITS.field),
        cluster: clip(raw.cluster, LIMITS.field),
    }
}

const sent = new Set<string>()

export function sendReport(kind: ReportKind, error: unknown) {
    if (typeof window === 'undefined') return
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown'))
    const report = cleanReport({
        kind,
        message: err.message || err.name,
        stack: err.stack,
        path: window.location.pathname,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
        cluster: process.env.NEXT_PUBLIC_CLUSTER ?? 'devnet',
    })
    if (!report || sent.has(report.message) || sent.size >= LIMITS.perPage) return
    sent.add(report.message)
    const body = JSON.stringify(report)
    if (navigator.sendBeacon?.('/api/report', new Blob([body], { type: 'application/json' }))) return
    fetch('/api/report', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
}
