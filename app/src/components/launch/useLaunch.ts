'use client'

import { useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notifyError } from '@/lib/notify'
import { simulateOrThrow } from '@/lib/tx'
import { LAUNCHPAD } from '@/lib/config'
import { type LaunchRequest, prepareLaunch } from '@/lib/launch'
import { withRetry } from '@/lib/rpc'
import { prepare, sendAll, tollWriter } from '@/lib/solve'

export interface Launched {
    problem: string
    signature: string
}

export function useLaunch() {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, signAllTransactions } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [launched, setLaunched] = useState<Launched | null>(null)

    const launch = async (request: LaunchRequest | null) => {
        if (!publicKey || !wallet || !signAllTransactions) return setVisible(true)
        if (!request) return
        setBusy(true)
        try {
            setNote('Preparing the launch…')
            const program = tollWriter(connection, wallet)
            const prepared = await prepareLaunch(connection, program, LAUNCHPAD, publicKey, request, window.location.origin)
            await prepare(connection, [prepared.create, prepared.register], publicKey)
            await simulateOrThrow(connection, prepared.create)
            setNote('Approve the launch in your wallet: two transactions, one approval.')
            const [create, register] = await signAllTransactions([prepared.create, prepared.register])
            create.partialSign(prepared.baseMint)
            setNote(request.firstBuy.gtn(0) ? 'Creating the token, its bonding curve and your first buy…' : 'Creating the token and its bonding curve…')
            const [signature] = await sendAll(connection, [create], () => setNote('Registering the problem…'))
            await sendAll(connection, [register], () => {})
            await withRetry(() => queries.invalidateQueries({ queryKey: ['problems'] }))
            toast.success('Problem launched')
            setNote('')
            setLaunched({ problem: prepared.problem.toBase58(), signature })
        } catch (error) {
            notifyError(error)
            setNote('')
        } finally {
            setBusy(false)
        }
    }

    return { publicKey, busy, note, launch, launched }
}
