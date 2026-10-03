import anchor from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { exitCode, runKeeper } from '../src/lib/keeper'
import { CLUSTER } from '../src/lib/config'
import { serverConnection } from '../src/lib/server'
import { tollWriter } from '../src/lib/solve/program'

const secret = process.env.KEEPER_SECRET_KEY
if (!secret) {
    console.error('KEEPER_SECRET_KEY is not set')
    process.exit(2)
}
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
const connection = serverConnection()
const GENESIS: Record<string, string> = { mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' }
const genesis = await connection.getGenesisHash()
if (genesis !== GENESIS[CLUSTER]) {
    console.error(`the RPC serves genesis ${genesis}, which is not ${CLUSTER}; check SOLANA_RPC_URL and vars.CLUSTER`)
    process.exit(2)
}
const program = tollWriter(connection, new anchor.Wallet(keeper) as never)
const balance = await connection.getBalance(keeper.publicKey)
console.log(`keeper ${keeper.publicKey.toBase58()} holds ${balance / 1e9} SOL`)

const run = await runKeeper(connection, program, keeper, (line) => console.log(line))
if (run.skipped) process.exit(exitCode(run))
console.log(`swept ${run.swept.length} problem(s), finished ${run.checked.length} check(s), ${run.failures.length} failure(s)${run.capped ? ', spend cap reached' : ''}`)
for (const failure of run.failures) console.error(`failure: ${failure}`)
process.exit(exitCode(run))
