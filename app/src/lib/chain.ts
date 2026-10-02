import { AnchorProvider, BorshAccountsCoder, type Idl, Program } from '@coral-xyz/anchor'
import { type AccountInfo, type Connection, PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js'
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DBC, type ProblemAccount, problemPhase, type ProblemPhase, tollIdl } from '@meteortoll/core'
import { classify } from './classify'
import { CATALOG, LAUNCHPAD } from './config'
import { type KnownFormat, knownFormat } from './known'
import { metadataAddress, parseMetadata, type TokenName } from './metaplex'
import { solPerToken } from './trades'

const readOnlyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
}

export function tollReader(connection: Connection) {
    return new Program(tollIdl as Idl, new AnchorProvider(connection, readOnlyWallet, { commitment: 'confirmed' }))
}

type Accounts = Record<
    string,
    {
        all(filters?: unknown[]): Promise<{ publicKey: PublicKey; account: unknown }[]>
        fetch(key: PublicKey): Promise<unknown>
    }
>

/// What the app shows about a problem beyond its account: the curated catalog entry when there is
/// one, otherwise the token's own name and the known-formats table.
export interface ProblemInfo {
    name: string
    symbol: string
    kind: 'demo' | 'open'
    demoNote?: string
    coefficients: string
    bestKnown?: KnownFormat['bestKnown']
    team?: KnownFormat['team']
    /// The team's tool already holds a scheme at or below the target, so the team could solve it.
    teamMeetsTarget: boolean
    listed: boolean
    hidden: boolean
}

export interface ProblemView {
    address: string
    account: ProblemAccount
    info: ProblemInfo
    phase: ProblemPhase
    slot: number
    /// Quote held in the bounty vault.
    vaultLamports: bigint
    /// Creator fees still in the curve, until someone sweeps them.
    unsweptLamports: bigint
    /// Bonds forfeited by failing schemes: lamports the problem account holds above its rent,
    /// paid to the solver at claim.
    bondsLamports: bigint
    curveProgress: number
    graduated: boolean
    /// SOL per whole token on the curve; null once graduated, when the price lives in DAMM v2.
    priceSol: number | null
    graceEndsAtSlot: number | null
}

function describe(address: string, account: ProblemAccount, token: TokenName | undefined): ProblemInfo {
    const curated = CATALOG[address]
    const known = knownFormat(account.n1, account.n2, account.n3)
    const team = curated?.ourRecord ?? known?.team
    const shape = `${account.n1}×${account.n2}×${account.n3}`
    return {
        name: curated?.name ?? token?.name ?? `${shape} rank ≤ ${account.targetRank}`,
        symbol: curated?.symbol ?? token?.symbol ?? '',
        ...classify(curated, team, account.targetRank),
        coefficients: curated?.coefficients ?? 'integers, |c| <= 128',
        bestKnown: curated?.bestKnown ?? known?.bestKnown,
        team,
        listed: !!curated,
        hidden: !!curated?.hidden,
    }
}

const dbcCoder = new BorshAccountsCoder(DynamicBondingCurveIdl as Idl)

/// DBC's pool state as this Anchor version's coder decodes it (IDL field names, snake_case).
export interface PoolState {
    config: PublicKey
    base_vault: PublicKey
    quote_vault: PublicKey
    quote_reserve: { toString(): string }
    creator_base_fee: { toString(): string }
    creator_quote_fee: { toString(): string }
    is_migrated: number
    is_creator_withdraw_surplus: number
    sqrt_price: { toString(): string }
}

/// getMultipleAccountsInfo in pages of 100 (the RPC limit), pages fetched together.
async function fetchMany(connection: Connection, keys: PublicKey[]): Promise<(AccountInfo<Buffer> | null)[]> {
    const pages: PublicKey[][] = []
    for (let i = 0; i < keys.length; i += 100) pages.push(keys.slice(i, i + 100))
    const results = await Promise.all(pages.map((page) => connection.getMultipleAccountsInfo(page, 'confirmed')))
    return results.flat()
}

export function decodePoolState(info: AccountInfo<Buffer> | null): PoolState | null {
    if (!info || !info.owner.equals(DBC)) return null
    try {
        return (dbcCoder.decode('VirtualPool', info.data) as { pool_state: PoolState }).pool_state
    } catch {
        return null
    }
}

export function decodePoolConfig(info: AccountInfo<Buffer> | null): { migrationQuoteThreshold: bigint } | null {
    if (!info || !info.owner.equals(DBC)) return null
    try {
        const config = dbcCoder.decode('PoolConfig', info.data) as { migration_quote_threshold: { toString(): string } }
        return { migrationQuoteThreshold: BigInt(config.migration_quote_threshold.toString()) }
    } catch {
        return null
    }
}

/// SPL token account amount: u64 little-endian after the mint and owner.
function tokenAmount(info: AccountInfo<Buffer> | null): bigint {
    if (!info || info.data.length < 72) return 0n
    return new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength).getBigUint64(64, true)
}

/// Everything the solver can collect: the vault, fees still in the curve, and forfeited bonds.
export const totalBounty = (p: Pick<ProblemView, 'vaultLamports' | 'unsweptLamports' | 'bondsLamports'>) => p.vaultLamports + p.unsweptLamports + p.bondsLamports

/// Lamports an account holds above what rent exemption needs: what the program can pay out of it.
export function spareLamports(info: Pick<AccountInfo<Buffer>, 'lamports' | 'data'> | null, rentExempt: bigint): bigint {
    if (!info) return 0n
    const spare = BigInt(info.lamports) - rentExempt
    return spare > 0n ? spare : 0n
}

/// Everything the app shows for a set of problems in two batched reads: pools, vaults, the problem
/// accounts themselves and token metadata together, then the (usually single) launch config.
async function views(connection: Connection, rows: { publicKey: PublicKey; account: ProblemAccount }[], slot: number): Promise<ProblemView[]> {
    const n = rows.length
    const infos = await fetchMany(connection, [
        ...rows.map((r) => r.account.pool),
        ...rows.map((r) => r.account.quoteVault),
        ...rows.map((r) => metadataAddress(r.account.baseMint)),
        ...rows.map((r) => r.publicKey),
    ])
    // Every problem account has the same size, so one rent figure serves them all.
    const problemSize = infos[3 * n]?.data.length
    const rentExempt = problemSize ? BigInt(await connection.getMinimumBalanceForRentExemption(problemSize)) : 0n
    const pools = infos.slice(0, n).map(decodePoolState)
    const configKeys = [...new Map(pools.filter((p) => p !== null).map((p) => [p.config.toBase58(), p.config])).values()]
    const configInfos = configKeys.length ? await fetchMany(connection, configKeys) : []
    const thresholds = new Map(configKeys.map((key, i) => [key.toBase58(), decodePoolConfig(configInfos[i])?.migrationQuoteThreshold ?? null]))

    return rows.map(({ publicKey, account }, i) => {
        const pool = pools[i]
        const metadata = infos[2 * n + i]
        const token = metadata ? parseMetadata(metadata.data) ?? undefined : undefined
        const threshold = pool ? thresholds.get(pool.config.toBase58()) : null
        const progress = pool && threshold ? Number(pool.quote_reserve.toString()) / Number(threshold) : 0
        return {
            address: publicKey.toBase58(),
            account,
            info: describe(publicKey.toBase58(), account, token),
            phase: problemPhase(account, slot),
            slot,
            vaultLamports: tokenAmount(infos[n + i]),
            bondsLamports: spareLamports(infos[3 * n + i], rentExempt),
            unsweptLamports: pool ? BigInt(pool.creator_quote_fee.toString()) : 0n,
            curveProgress: Math.min(1, Math.max(0, progress)),
            graduated: pool ? pool.is_migrated !== 0 : false,
            priceSol: pool && pool.is_migrated === 0 ? solPerToken(BigInt(pool.sqrt_price.toString())) : null,
            graceEndsAtSlot: account.solver ? account.solvedAtSlot.toNumber() + account.graceSlots.toNumber() : null,
        }
    })
}

export async function fetchProblems(connection: Connection): Promise<ProblemView[]> {
    const toll = tollReader(connection)
    const accounts = toll.account as never as Accounts
    const [rows, slot] = await Promise.all([
        accounts.problem.all([{ memcmp: { offset: 8, bytes: LAUNCHPAD.toBase58() } }]),
        connection.getSlot('confirmed'),
    ])
    return views(connection, rows.map((row) => ({ publicKey: row.publicKey, account: row.account as ProblemAccount })), slot)
}

/// A problem registered on another launchpad: the same program, but someone else's rules (their
/// own DBC config, which may route fees elsewhere, and their own grace window). The site never
/// presents one as a meteortoll problem.
export class ForeignProblemError extends Error {
    constructor(
        readonly address: string,
        readonly launchpad: string
    ) {
        super(`problem ${address} belongs to launchpad ${launchpad}, not to this site's`)
        this.name = 'ForeignProblemError'
    }
}

export function assertOfficial(address: string, account: Pick<ProblemAccount, 'launchpad'>, launchpad: PublicKey = LAUNCHPAD) {
    if (!account.launchpad.equals(launchpad)) throw new ForeignProblemError(address, account.launchpad.toBase58())
}

export async function fetchProblem(connection: Connection, address: string): Promise<ProblemView> {
    const toll = tollReader(connection)
    const key = new PublicKey(address)
    const [account, slot] = await Promise.all([
        (toll.account as never as Accounts).problem.fetch(key),
        connection.getSlot('confirmed'),
    ])
    assertOfficial(address, account as ProblemAccount)
    const [view] = await views(connection, [{ publicKey: key, account: account as ProblemAccount }], slot)
    return view
}
