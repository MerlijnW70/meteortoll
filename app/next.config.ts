import type { NextConfig } from 'next'

// A wallet app must not be framed (clickjacking a transaction approval) and should only talk to
// its own origin and Solana's public websocket endpoints. Next's bootstrap needs inline scripts;
// the verifier needs WebAssembly compilation. Development tooling needs eval, so the policy is
// only enforced in production builds.
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
].join('; ')

const securityHeaders = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
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
