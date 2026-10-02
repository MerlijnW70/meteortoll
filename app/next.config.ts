import type { NextConfig } from 'next'

const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' wss://api.devnet.solana.com wss://api.mainnet-beta.solana.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    async headers() {
        if (process.env.NODE_ENV !== 'production') return []
        return [{ source: '/:path*', headers: securityHeaders }]
    },
}

export default nextConfig
