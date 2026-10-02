'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { BOND_LAMPORTS, SUBMISSION_HEADER } from '@meteortoll/core'
import { tollReader } from '@/lib/chain'
import { CHUNK } from '@/lib/solve/build'
import { sol } from '../ui'

type Sized = Record<string, { size: number }>

function useSubmitCost(schemeLength: number) {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    return useQuery({
        queryKey: ['submitCost', schemeLength, publicKey?.toBase58()],
        queryFn: async () => {
            const attemptSize = (tollReader(connection).account as never as Sized).attempt.size
            const [attempt, buffer, balance] = await Promise.all([
                connection.getMinimumBalanceForRentExemption(attemptSize),
                connection.getMinimumBalanceForRentExemption(SUBMISSION_HEADER + schemeLength),
                publicKey ? connection.getBalance(publicKey, 'confirmed') : Promise.resolve(null),
            ])
            return { bond: BigInt(BOND_LAMPORTS), rent: BigInt(attempt + buffer), balance: balance === null ? null : BigInt(balance) }
        },
        staleTime: 30_000,
    })
}

const APPROVALS = 3

export function SubmitCost({ schemeLength, verifyCalls }: { schemeLength: number; verifyCalls: number }) {
    const cost = useSubmitCost(schemeLength)
    const transactions = 1 + Math.ceil(schemeLength / CHUNK) + 1 + verifyCalls + 1
    if (!cost.data) return null
    const { bond, rent, balance } = cost.data
    const needed = bond + rent
    const short = balance !== null && balance < needed
    return (
        <div className="space-y-2 rounded-lg bg-panel-2 p-4 text-sm">
            <dl className="space-y-1.5">
                <div className="flex justify-between gap-3">
                    <dt className="text-muted">Bond, back unless the scheme fails</dt>
                    <dd className="num">{sol(bond)} SOL</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-muted">Rent for the upload, back when you close</dt>
                    <dd className="num">{sol(rent, 5)} SOL</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
                    <dt>Locked while you submit</dt>
                    <dd className="num">{sol(needed, 5)} SOL</dd>
                </div>
            </dl>
            <p className="text-xs text-muted">
                Plus network fees for about {transactions} transactions, in {APPROVALS} wallet approvals: commit; upload, reveal and verify; claim.
            </p>
            {short && (
                <p role="alert" className="text-xs text-warn">
                    Your wallet holds {sol(balance!, 5)} SOL; add at least {sol(needed - balance!, 5)} SOL plus fees before committing.
                </p>
            )}
        </div>
    )
}
