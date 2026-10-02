import { ImageResponse } from 'next/og'
import { ForeignProblemError, totalBounty } from '@/lib/chain'
import { serverProblem } from '@/lib/server'

export const alt = 'A matrix multiplication problem on meteortoll'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const colors = { bg: '#0a0b0e', panel: '#111318', text: '#e8eaee', muted: '#8a92a0', accent: '#8b7cff', good: '#3ddc84', warn: '#ffb547' }

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
    const { address } = await params
    let title = 'meteortoll'
    let line = 'Open problems you can trade'
    let badge = ''
    let badgeColor = colors.accent
    let figure = ''
    try {
        const problem = await serverProblem(address)
        const { n1, n2, n3, targetRank } = problem.account
        const best = problem.info.bestKnown?.rank
        const bounty = (Number(totalBounty(problem)) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 })
        title = `${n1}×${n2}×${n3} · rank ≤ ${targetRank}`
        line = problem.phase === 'open' ? `Bounty ${bounty} SOL · verified on-chain, no committee` : `Solved with rank ${problem.account.solvedRank} · verified on-chain`
        badge = problem.phase === 'open' ? 'OPEN' : 'SOLVED'
        badgeColor = problem.phase === 'open' ? colors.accent : colors.good
        if (problem.info.kind === 'demo') badge = `DEMO · ${badge}`
        figure = best ? `${best} → ${targetRank}` : `${n1 * n2 * n3} → ${targetRank}`
    } catch (error) {
        // Another launchpad's problem must not travel under this site's name; anything else falls
        // back to the brand card.
        if (error instanceof ForeignProblemError) {
            title = 'Not a meteortoll problem'
            line = 'Registered on another launchpad. meteortoll does not list or vouch for it.'
            badge = 'NOT LISTED'
            badgeColor = colors.warn
        }
    }
    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: colors.bg, color: colors.text, padding: 64 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, color: colors.muted }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: colors.accent, display: 'flex' }} />
                    meteortoll
                    {badge && (
                        <div style={{ marginLeft: 'auto', fontSize: 24, color: badgeColor, border: `2px solid ${badgeColor}`, borderRadius: 999, padding: '6px 18px' }}>{badge}</div>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ fontSize: 88, fontFamily: 'monospace', letterSpacing: -2 }}>{title}</div>
                    <div style={{ fontSize: 36, color: colors.muted }}>{line}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 28, color: colors.muted }}>Matrix multiplication · Meteora DBC · Solana</div>
                    {figure && <div style={{ fontSize: 96, fontFamily: 'monospace', color: colors.accent }}>{figure}</div>}
                </div>
            </div>
        ),
        size
    )
}
