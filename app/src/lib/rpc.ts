/// Public RPCs answer bursts with 429. Waits and tries again instead of abandoning a step halfway.
export async function withRetry<T>(run: () => Promise<T>, attempts = 8): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run()
        } catch (error) {
            const limited = /429|rate limit|Too Many Requests/i.test(String(error))
            if (!limited || attempt >= attempts) throw error
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
        }
    }
}
