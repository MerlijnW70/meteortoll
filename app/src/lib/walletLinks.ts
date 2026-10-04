export interface WalletLink {
    name: string
    href: string
}

export const INSTALL_LINKS: WalletLink[] = [
    { name: 'Phantom', href: 'https://phantom.com/download' },
    { name: 'Solflare', href: 'https://solflare.com/download' },
    { name: 'MetaMask', href: 'https://metamask.io/download' },
]

export function isMobile(userAgent: string): boolean {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
}

export function openInLinks(pageUrl: string): WalletLink[] {
    const url = new URL(pageUrl)
    const page = encodeURIComponent(url.href)
    const ref = encodeURIComponent(url.origin)
    return [
        { name: 'Phantom', href: `https://phantom.app/ul/browse/${page}?ref=${ref}` },
        { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${page}?ref=${ref}` },
        { name: 'MetaMask', href: `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}` },
    ]
}
