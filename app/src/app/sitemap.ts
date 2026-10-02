import type { MetadataRoute } from 'next'
import { fetchProblems } from '@/lib/chain'
import { serverConnection, SITE_URL } from '@/lib/server'

export const revalidate = 3600

const PAGES = ['/', '/solve', '/launch', '/trust', '/terms']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const pages: MetadataRoute.Sitemap = PAGES.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: 'daily', priority: path === '/' ? 1 : 0.6 }))
    try {
        const problems = (await fetchProblems(serverConnection())).filter((p) => !p.info.hidden)
        return [...pages, ...problems.map((p) => ({ url: `${SITE_URL}/p/${p.address}`, changeFrequency: 'hourly' as const, priority: 0.8 }))]
    } catch (error) {
        console.error('[sitemap] problems unavailable', error)
        return pages
    }
}
