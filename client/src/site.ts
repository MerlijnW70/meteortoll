// The site the tokens' metadata points at: wallets, Jupiter and explorers read each token's name,
// description and image from the problem's own page, as for tokens launched through the site.

export const SITE_URL = (process.env.TOLL_SITE ?? 'https://meteortoll.vercel.app').replace(/\/+$/, '')

export const metadataUri = (site: string, mint: string) => `${site.replace(/\/+$/, '')}/api/metadata/${mint}`
