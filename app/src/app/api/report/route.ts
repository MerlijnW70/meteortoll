import { cleanReport, LIMITS } from '@/lib/report'
import { Budget, clientIp, fromThisSite } from '@/lib/rpcPolicy'

const reports = new Budget(20, 60_000)

export async function POST(request: Request) {
    if (!fromThisSite(request.headers, request.url)) return new Response(null, { status: 403 })
    if (reports.over(clientIp(request.headers), 1)) return new Response(null, { status: 429 })
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
