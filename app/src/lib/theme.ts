export const THEMES = ['dark', 'light', 'system'] as const
export type ThemeChoice = (typeof THEMES)[number]
export type Theme = 'dark' | 'light'

export const THEME_KEY = 'meteortoll:theme'
export const DEFAULT_THEME: ThemeChoice = 'system'

export function parseChoice(stored: string | null): ThemeChoice {
    return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as ThemeChoice) : DEFAULT_THEME
}

export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): Theme {
    if (choice === 'system') return prefersLight ? 'light' : 'dark'
    return choice
}

export const THEME_BOOT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});}catch(e){}if(c!=='dark'&&c!=='light')c='system';var l=window.matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.dataset.theme=c==='system'?(l?'light':'dark'):c;})()`
