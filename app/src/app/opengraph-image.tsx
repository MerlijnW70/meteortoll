import { ImageResponse } from 'next/og'

export const alt = 'meteortoll: open problems you can trade'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, background: '#0a0b0e', color: '#e8eaee', padding: 80 }}>
                <div style={{ fontSize: 34, color: '#5ee6c1' }}>meteortoll</div>
                <div style={{ fontSize: 76, lineHeight: 1.1, maxWidth: 1000 }}>Open problems you can trade.</div>
                <div style={{ fontSize: 34, color: '#8a92a0', maxWidth: 1000 }}>Trading fees fund the prize. A Solana program verifies the answer. No committee.</div>
            </div>
        ),
        size
    )
}
