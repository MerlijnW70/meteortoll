// The wallet adapter's stylesheet, minus its import of a Google font: that request would break
// the site's Content Security Policy (and tell Google about every visitor). The wallet buttons use
// the site's own font instead. `walletCss.test.ts` regenerates this from the installed package, so
// an upgrade that changes the upstream file cannot leave the copy stale.

export const FONT_IMPORT = /^@import url\('https:\/\/fonts\.googleapis\.com\/[^']*'\);\s*\n/m
export const UPSTREAM_FONT = /'DM Sans', 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif/g
export const SITE_FONT = 'var(--font-geist-sans), system-ui, sans-serif'

export function localWalletCss(upstream: string): string {
    return upstream.replace(FONT_IMPORT, '').replace(UPSTREAM_FONT, SITE_FONT)
}
