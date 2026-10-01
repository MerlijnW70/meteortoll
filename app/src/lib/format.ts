// The site is written in English, so numbers and dates read the same in every browser: a Dutch
// browser would otherwise print 20.803 bytes for 20,803. Lint refuses locale formatting without
// an explicit locale (eslint.config.mjs).

export const LOCALE = 'en-US'

/// A whole count with thousands separators: 20,803.
export const count = (n: number) => n.toLocaleString(LOCALE)
