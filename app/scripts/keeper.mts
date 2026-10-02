import anchor from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { runKeeper } from '../src/lib/keeper'
import { serverConnection } from '../src/lib/server'
import { tollWriter } from '../src/lib/solve/program'

const secret = process.env.KEEPER_SECRET_KEY
if (!secret) {
    console.error('KEEPER_SECRET_KEY is not set')
    process.exit(2)
}
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
const connection = serverConnection()
const program = tollWriter(connection, new anchor.Wallet(keeper) as never)
const balance = await connection.getBalance(keeper.publicKey)
console.log(`keeper ${keeper.publicKey.toBase58()} holds ${balance / 1e9} SOL`)

const run = await runKeeper(connection, program, keeper, (line) => console.log(line))
if (run.skipped) process.exit(0)
console.log(`swept ${run.swept.length} problem(s), finished ${run.checked.length} check(s), ${run.failures.length} failure(s)${run.capped ? ', spend cap reached' : ''}`)
for (const failure of run.failures) console.error(`failure: ${failure}`)
process.exit(run.failures.length > 0 ? 1 : 0)
