import type { Metadata } from 'next'
import { ProblemPage } from '@/components/ProblemPage'
import { fetchProblem, ForeignProblemError, totalBounty } from '@/lib/chain'
import { serverConnection } from '@/lib/server'

export async function generateMetadata(props: PageProps<'/p/[address]'>): Promise<Metadata> {
    const { address } = await props.params
    try {
        const problem = await fetchProblem(serverConnection(), address)
        const { n1, n2, n3, targetRank } = problem.account
        const bounty = Number(totalBounty(problem)) / 1e9
        const title = `⟨${n1}×${n2}×${n3} : ≤${targetRank}⟩ · ${problem.phase === 'open' ? `${bounty.toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL bounty` : 'solved'}`
        const description =
            problem.phase === 'open'
                ? `Multiply a ${n1}×${n2} by a ${n2}×${n3} matrix with ${targetRank} multiplications. Trading fees fund the bounty; a Solana program verifies the answer.`
                : `Solved with a scheme of rank ${problem.account.solvedRank}, verified on-chain. Check it yourself in the browser.`
        return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
    } catch (error) {
        return { title: error instanceof ForeignProblemError ? 'Not a meteortoll problem' : 'Problem', robots: { index: false } }
    }
}

export default async function Page(props: PageProps<'/p/[address]'>) {
    const { address } = await props.params
    return <ProblemPage address={address} />
}
