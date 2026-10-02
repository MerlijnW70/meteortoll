import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { type Connection, PublicKey } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress } from '@meteortoll/core'
import { type ProblemView, tollReader } from './chain'

export interface Position {
    problem: ProblemView
    tokens: bigint
    valueSol: number | null
    attempt: AttemptAccount | null
    claimable: boolean
}

export interface Portfolio {
    lamports: bigint
    positions: Position[]
}

const TOKEN_DECIMALS = 6

function amount(data: Uint8Array | undefined): bigint {
    if (!data || data.length < 72) return 0n
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true)
}

export async function fetchPortfolio(connection: Connection, owner: PublicKey, problems: ProblemView[]): Promise<Portfolio> {
    const keys = [
        ...problems.map((p) => getAssociatedTokenAddressSync(p.account.baseMint, owner, true)),
        ...problems.map((p) => attemptAddress(new PublicKey(p.address), owner)),
    ]
    const pages: PublicKey[][] = []
    for (let i = 0; i < keys.length; i += 100) pages.push(keys.slice(i, i + 100))
    const [lamports, results] = await Promise.all([
        connection.getBalance(owner, 'confirmed'),
        Promise.all(pages.map((page) => connection.getMultipleAccountsInfo(page, 'confirmed'))),
    ])
    const infos = results.flat()
    const coder = tollReader(connection).coder.accounts
    const n = problems.length

    const positions = problems.map((problem, i): Position => {
        const tokens = amount(infos[i]?.data)
        const attemptInfo = infos[n + i]
        let attempt: AttemptAccount | null = null
        if (attemptInfo) {
            try {
                attempt = coder.decode('attempt', attemptInfo.data) as AttemptAccount
            } catch {
                attempt = null
            }
        }
        return {
            problem,
            tokens,
            valueSol: problem.priceSol === null ? null : (Number(tokens) / 10 ** TOKEN_DECIMALS) * problem.priceSol,
            attempt,
            claimable: problem.phase === 'solved' && !!problem.account.solver?.equals(owner),
        }
    })
    return { lamports: BigInt(lamports), positions: positions.filter((p) => p.tokens > 0n || p.attempt || p.claimable) }
}
