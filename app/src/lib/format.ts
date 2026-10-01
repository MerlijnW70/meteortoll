// The site is written in English, so numbers and dates read the same in every browser: a Dutch
// browser would otherwise print 20.803 bytes for 20,803. Lint refuses locale formatting without
// an explicit locale (eslint.config.mjs).

export const LOCALE = 'en-US'

/// A whole count with thousands separators: 20,803.
export const count = (n: number) => n.toLocaleString(LOCALE)

/// A share as a percentage, rounded down: a curve 99.997% full must not read as 100%.
export function percentDown(share: number, digits: number): string {
    const scale = 10 ** digits
    return `${(Math.floor(Math.max(0, Math.min(1, share)) * 100 * scale) / scale).toFixed(digits)}%`
}

/// Decimals of every problem token (the launch config mints them with 6).
export const BASE_DECIMALS = 6

/// A problem-token amount from its smallest units: whole tokens, or up to 6 decimals below one.
export function tokens(atoms: bigint): string {
    const whole = Number(atoms) / 10 ** BASE_DECIMALS
    return whole.toLocaleString(LOCALE, { maximumFractionDigits: whole < 1 ? 6 : 0 })
}
