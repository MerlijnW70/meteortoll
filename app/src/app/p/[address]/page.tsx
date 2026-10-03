import type { Metadata } from 'next'
import { ProblemPage } from '@/components/ProblemPage'
import { shareState } from '@/lib/card'
import { ForeignProblemError, totalBounty } from '@/lib/chain'
import { CLUSTER } from '@/lib/config'
import { serverProblem } from '@/lib/server'

export async function generateMetadata(props: PageProps<'/p/[address]'>): Promise<Metadata> {
    const { address } = await props.params
    try {
        const problem = await serverProblem(address)
        const { n1, n2, n3, targetRank } = problem.account
        const prize = (Number(totalBounty(problem)) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 })
        const state = shareState(problem, CLUSTER === 'mainnet')
        const status = { prize: `${prize} SOL prize`, demo: 'demo', notWinnable: 'not winnable', unreviewed: 'not reviewed', review: 'checking an answer', solved: 'solved' }[state]
        const title = `⟨${n1}×${n2}×${n3} : ≤${targetRank}⟩ · ${status}`
        const ask = `Multiply a ${n1}×${n2} by a ${n2}×${n3} matrix with ${targetRank} multiplications.`
        const description = {
            prize: `${ask} Trading fees fund the prize; a Solana program verifies the answer.`,
            demo: `${ask} A disclosed demo, not a public prize.`,
            notWinnable: `${ask} This target is already answered or impossible, so no prize can be won.`,
            unreviewed: `${ask} Launched by someone else and not reviewed by meteortoll.`,
            review: `A scheme of rank ${problem.account.solvedRank} passed the on-chain check; an earlier commitment can still take it during the grace window.`,
            solved: `Solved with a scheme of rank ${problem.account.solvedRank}, verified on-chain. Check it yourself in the browser.`,
        }[state]
        return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
    } catch (error) {
        return { title: error instanceof ForeignProblemError ? 'Not a meteortoll problem' : 'Problem', robots: { index: false } }
    }
}

export default async function Page(props: PageProps<'/p/[address]'>) {
    const { address } = await props.params
    return <ProblemPage address={address} />
}
