export const LOCALE = 'en-US'

export const count = (n: number) => n.toLocaleString(LOCALE)

export function percentDown(share: number, digits: number): string {
    const scale = 10 ** digits
    return `${(Math.floor(Math.max(0, Math.min(1, share)) * 100 * scale) / scale).toFixed(digits)}%`
}

export const BASE_DECIMALS = 6

export function tokens(atoms: bigint): string {
    const whole = Number(atoms) / 10 ** BASE_DECIMALS
    return whole.toLocaleString(LOCALE, { maximumFractionDigits: whole < 1 ? 6 : 0 })
}

export function ago(seconds: number | null, now = Date.now() / 1000): string {
    if (!seconds) return ''
    const delta = Math.max(0, now - seconds)
    if (delta < 60) return `${Math.floor(delta)}s`
    if (delta < 3600) return `${Math.floor(delta / 60)}m`
    if (delta < 86400) return `${Math.floor(delta / 3600)}h`
    return `${Math.floor(delta / 86400)}d`
}
