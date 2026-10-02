import type { MetadataRoute } from 'next'
import { fetchProblems } from '@/lib/chain'
import { serverConnection, SITE_URL } from '@/lib/server'

/// Refreshed hourly, so new launches appear without a deploy.
export const revalidate = 3600

const PAGES = ['/', '/solve', '/launch', '/trust', '/terms']

/// The fixed pages, and a page per problem the site lists. If the chain cannot be read (say, during
/// a build while the RPC is down), the fixed pages still make a valid sitemap.
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
