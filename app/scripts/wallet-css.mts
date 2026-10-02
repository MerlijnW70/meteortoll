import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { localWalletCss } from '../src/lib/walletCss.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
const upstream = readFileSync(require.resolve('@solana/wallet-adapter-react-ui/styles.css'), 'utf8')
writeFileSync(new URL('../src/styles/wallet-adapter.css', import.meta.url), localWalletCss(upstream))
console.log('wrote app/src/styles/wallet-adapter.css')
