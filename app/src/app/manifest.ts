import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'meteortoll — open problems you can trade',
        short_name: 'meteortoll',
        description: 'Open matrix multiplication problems as tokens on Meteora. Trading fees fund the prize; a scheme verified on-chain claims it.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0b0e',
        theme_color: '#0a0b0e',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    }
}
