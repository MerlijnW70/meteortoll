export const SITE_URL = (process.env.TOLL_SITE ?? 'https://meteortoll.vercel.app').replace(/\/+$/, '')

export const metadataUri = (site: string, mint: string) => `${site.replace(/\/+$/, '')}/api/metadata/${mint}`
