'use client'

import { useEffect, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import type { PublicKey } from '@solana/web3.js'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notifyError } from '@/lib/notify'
import { simulateOrThrow } from '@/lib/tx'
import { LAUNCHPAD } from '@/lib/config'
import { finishRegistration, type LaunchRequest, type PendingLaunch, prepareLaunch } from '@/lib/launch'
import { tollReader } from '@/lib/chain'
import { withRetry } from '@/lib/rpc'
import { prepare, sendAll, tollWriter } from '@/lib/solve'

export interface Launched {
    problem: string
    signature: string
    n: number[]
    target: number
}

const pendingKey = (owner: PublicKey) => `meteortoll.pendingLaunch.${owner.toBase58()}`

function readPending(owner: PublicKey): PendingLaunch | null {
    try {
        const raw = localStorage.getItem(pendingKey(owner))
        return raw ? (JSON.parse(raw) as PendingLaunch) : null
    } catch {
        return null
    }
}

function writePending(owner: PublicKey, pending: PendingLaunch | null) {
    try {
        if (pending) localStorage.setItem(pendingKey(owner), JSON.stringify(pending))
        else localStorage.removeItem(pendingKey(owner))
    } catch {}
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
    const [unfinished, setUnfinished] = useState<PendingLaunch | null>(null)

    useEffect(() => {
        if (!publicKey) return
        const pending = readPending(publicKey)
        if (!pending) return
        let live = true
        finishRegistration(connection, tollReader(connection), LAUNCHPAD, publicKey, pending)
            .then((found) => {
                if (!live) return
                if (found) setUnfinished(pending)
                else writePending(publicKey, null)
            })
            .catch(() => {})
        return () => {
            live = false
        }
    }, [connection, publicKey])

    const done = async (owner: PublicKey, problem: string, signature: string, pending: PendingLaunch) => {
        writePending(owner, null)
        setUnfinished(null)
        await withRetry(() => queries.invalidateQueries({ queryKey: ['problems'] }))
        toast.success('Problem launched')
        setNote('')
        setLaunched({ problem, signature, n: pending.n, target: pending.target })
    }

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
            const pending: PendingLaunch = { n: request.n, target: request.target, pool: prepared.pool.toBase58(), baseMint: prepared.baseMint.publicKey.toBase58() }
            writePending(publicKey, pending)
            setNote(request.firstBuy.gtn(0) ? 'Creating the token, its bonding curve and your first buy…' : 'Creating the token and its bonding curve…')
            const [signature] = await sendAll(connection, [create], () => setNote('Registering the problem…'))
            try {
                await sendAll(connection, [register], () => {})
            } catch (error) {
                setUnfinished(pending)
                throw error
            }
            await done(publicKey, prepared.problem.toBase58(), signature, pending)
        } catch (error) {
            notifyError(error)
            setNote('')
        } finally {
            setBusy(false)
        }
    }

    const finish = async () => {
        if (!publicKey || !wallet || !signAllTransactions) return setVisible(true)
        if (!unfinished) return
        setBusy(true)
        try {
            setNote('Preparing the registration…')
            const found = await finishRegistration(connection, tollWriter(connection, wallet), LAUNCHPAD, publicKey, unfinished)
            if (!found) {
                writePending(publicKey, null)
                setUnfinished(null)
                setNote('')
                toast.info('Nothing left to register')
                return
            }
            await prepare(connection, [found.register], publicKey)
            await simulateOrThrow(connection, found.register)
            setNote('Approve the registration in your wallet.')
            const [register] = await signAllTransactions([found.register])
            setNote('Registering the problem…')
            const [signature] = await sendAll(connection, [register], () => {})
            await done(publicKey, found.problem.toBase58(), signature, unfinished)
        } catch (error) {
            notifyError(error)
            setNote('')
        } finally {
            setBusy(false)
        }
    }

    return { publicKey, busy, note, launch, launched, unfinished, finish }
}
