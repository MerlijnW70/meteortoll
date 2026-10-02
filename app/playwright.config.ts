import { defineConfig, devices } from '@playwright/test'

// Browser tests against a production build of the site on devnet. They need no wallet: they read
// the chain and run the in-browser verifier. The server's RPC relay forwards to SOLANA_RPC_URL.
const PORT = 3200

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    expect: { timeout: 30_000 },
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'phone', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // A dedicated RPC from the environment wins; locally Next reads one from .env.local. The
        // public endpoint is a last resort: it rate-limits the history reads the totals need.
        env: process.env.SOLANA_RPC_URL ? { SOLANA_RPC_URL: process.env.SOLANA_RPC_URL } : {},
    },
})
