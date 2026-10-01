// Limits of the `/api/rpc` proxy, kept outside the route file so tests can read them
// (a Next.js route file may only export its handlers).

export const MAX_BATCH = 50
export const MAX_BODY_BYTES = 64 * 1024
