import { cleanReport, LIMITS } from '@/lib/report'

const WINDOW_MS = 60_000
const REPORTS_PER_WINDOW = 20
const budgets = new Map<string, { start: number; count: number }>()

function overBudget(client: string): boolean {
    const now = Date.now()
    const budget = budgets.get(client)
    if (!budget || now - budget.start > WINDOW_MS) {
        budgets.set(client, { start: now, count: 1 })
        if (budgets.size > 10_000) budgets.clear()
        return false
    }
    budget.count += 1
    return budget.count > REPORTS_PER_WINDOW
}

export async function POST(request: Request) {
    const origin = request.headers.get('origin')
    if (origin && new URL(origin).host !== new URL(request.url).host) return new Response(null, { status: 403 })
    if (overBudget(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown')) return new Response(null, { status: 429 })
    const text = await request.text()
    if (text.length > LIMITS.body) return new Response(null, { status: 413 })
    let report
    try {
        report = cleanReport(JSON.parse(text))
    } catch {
        report = null
    }
    if (!report) return new Response(null, { status: 400 })
    console.error('[client-error]', JSON.stringify(report))
    return new Response(null, { status: 204 })
}
