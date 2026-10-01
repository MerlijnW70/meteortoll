// Writes the encoded `create_config` arguments for a profile, for the Rust tests to replay
// against the real DBC program with their own accounts.
//
//   npm run encode-config -- <profile> <out.json>

import { writeFileSync } from 'node:fs'
import { Connection, Keypair } from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { launchParams, PROFILES, type Profile } from './params.js'

const [profile, out] = process.argv.slice(2) as [Profile, string]
if (!(profile in PROFILES) || !out) {
    console.error(`usage: encode-config <${Object.keys(PROFILES).join('|')}> <out.json>`)
    process.exit(2)
}

const params = launchParams(profile)
const client = new DynamicBondingCurveClient(new Connection('http://127.0.0.1:1'), 'confirmed')
const keys = Object.fromEntries(
    ['config', 'feeClaimer', 'leftoverReceiver', 'quoteMint', 'payer'].map((k) => [k, Keypair.generate().publicKey])
)
const tx = await client.partner.createConfig({ ...params, ...keys } as never)
const [ix] = tx.instructions
const names = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v.toBase58(), k]))

writeFileSync(
    out,
    JSON.stringify(
        {
            profile,
            data: Buffer.from(ix.data).toString('hex'),
            accounts: ix.keys.map((m) => ({
                role: names[m.pubkey.toBase58()] ?? m.pubkey.toBase58(),
                signer: m.isSigner,
                writable: m.isWritable,
            })),
            migrationQuoteThreshold: params.migrationQuoteThreshold.toString(),
        },
        null,
        2
    ) + '\n'
)
console.log(`${profile}: ${ix.data.length} bytes, migration threshold ${params.migrationQuoteThreshold.toString()}`)
