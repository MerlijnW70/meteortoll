// Live trades for a DBC pool, decoded from the `EvtSwap2` events DBC emits through event CPI.
// Meteora's docs say to index this event rather than rebuild trades from token transfers.

import { BorshCoder, type Idl, utils } from '@coral-xyz/anchor'
import type { Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DBC } from '@meteortoll/core'

const coder = new BorshCoder(DynamicBondingCurveIdl as Idl)
// Anchor prefixes event-CPI instruction data with sha256("anchor:event")[..8].
const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d])

export interface Trade {
    signature: string
    side: 'buy' | 'sell'
    trader: string
    quoteLamports: bigint
    baseAmount: bigint
    feeLamports: bigint
    quoteReserve: bigint
    migrationThreshold: bigint
    /// Pool price after the trade, as DBC's Q64.64 square root of quote atoms per base atom.
    sqrtPrice: bigint
    time: number | null
}

const Q64 = 2 ** 64

/// SOL per whole token from a Q64.64 square-root price, for a 6-decimal token quoted in SOL.
export function solPerToken(sqrtPrice: bigint, baseDecimals = 6, quoteDecimals = 9): number {
    const root = Number(sqrtPrice) / Q64
    return root * root * 10 ** (baseDecimals - quoteDecimals)
}

interface DecodedSwap {
    pool: PublicKey
    trade_direction: number
    swap_result: {
        included_fee_input_amount: { toString(): string }
        output_amount: { toString(): string }
        trading_fee: { toString(): string }
        next_sqrt_price: { toString(): string }
    }
    quote_reserve_amount: { toString(): string }
    migration_threshold: { toString(): string }
}

const QUOTE_TO_BASE = 1

function startsWith(data: Uint8Array, prefix: Uint8Array) {
    return prefix.every((byte, i) => data[i] === byte)
}

export function decodeSwaps(dataBase58: string[]): DecodedSwap[] {
    const found: DecodedSwap[] = []
    for (const encoded of dataBase58) {
        const data = utils.bytes.bs58.decode(encoded)
        if (!startsWith(data, EVENT_IX_TAG)) continue
        const event = coder.events.decode(utils.bytes.base64.encode(Buffer.from(data.subarray(8))))
        if (event?.name === 'EvtSwap2') found.push(event.data as unknown as DecodedSwap)
    }
    return found
}

export async function fetchTrades(connection: Connection, pool: PublicKey, limit = 20): Promise<Trade[]> {
    const signatures = await connection.getSignaturesForAddress(pool, { limit }, 'confirmed')
    const ok = signatures.filter((s) => !s.err)
    if (ok.length === 0) return []
    const transactions = await connection.getTransactions(
        ok.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }
    )
    const trades: Trade[] = []
    transactions.forEach((tx, index) => {
        if (!tx?.meta?.innerInstructions) return
        const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses })
        const dbcData = tx.meta.innerInstructions
            .flatMap((group) => group.instructions)
            .filter((ix) => keys.get(ix.programIdIndex)?.equals(DBC))
            .map((ix) => ix.data)
        for (const swap of decodeSwaps(dbcData)) {
            if (!swap.pool.equals(pool)) continue
            const buy = swap.trade_direction === QUOTE_TO_BASE
            const input = BigInt(swap.swap_result.included_fee_input_amount.toString())
            const output = BigInt(swap.swap_result.output_amount.toString())
            trades.push({
                signature: ok[index].signature,
                side: buy ? 'buy' : 'sell',
                trader: keys.get(0)?.toBase58() ?? '',
                quoteLamports: buy ? input : output,
                baseAmount: buy ? output : input,
                feeLamports: BigInt(swap.swap_result.trading_fee.toString()),
                quoteReserve: BigInt(swap.quote_reserve_amount.toString()),
                migrationThreshold: BigInt(swap.migration_threshold.toString()),
                sqrtPrice: BigInt(swap.swap_result.next_sqrt_price.toString()),
                time: tx.blockTime ?? null,
            })
        }
    })
    return trades
}
