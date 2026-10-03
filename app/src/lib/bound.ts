const P = 2 ** 61 - 1

export function errorBound(n1: number, n2: number, n3: number): number {
    return n1 * n2 + n2 * n3 + n3 * n1
}

export function errorBoundText(n1: number, n2: number, n3: number): string {
    const bound = errorBound(n1, n2, n3)
    const [mantissa, exponent] = (bound / P).toExponential(1).split('e')
    const superscript = (digits: string) => [...digits].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'['0123456789-'.indexOf(c)] ?? c).join('')
    return `${bound}/2⁶¹, about ${mantissa}·10${superscript(String(Number(exponent)))} per check`
}
