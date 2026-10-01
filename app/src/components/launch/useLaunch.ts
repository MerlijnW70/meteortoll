'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

/// Builds both launch transactions, asks the wallet once, adds the new mint's signature, then
/// sends them in order: the pool must exist before it can be handed to the problem.
export function useLaunch() {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, signAllTransactions } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')

    const launch = async (request: LaunchRequest) => {
        if (!publicKey || !wallet || !signAllTransactions) return setVisible(true)
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
            setNote('Creating the token and its bonding curve…')
            await sendAll(connection, [create], () => setNote('Registering the problem…'))
            await sendAll(connection, [register], () => {})
            await withRetry(() => queries.invalidateQueries({ queryKey: ['problems'] }))
            toast.success('Problem launched')
            router.push(`/p/${prepared.problem.toBase58()}`)
        } catch (error) {
            notifyError(error)
            setNote('')
        } finally {
            setBusy(false)
        }
    }

    return { publicKey, busy, note, launch }
}
