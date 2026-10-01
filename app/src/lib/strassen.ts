// Schoolbook and Strassen's multiplication of two-by-two matrices as lists of products and how each output uses them.

export type Entry = 'c11' | 'c12' | 'c21' | 'c22'
export type Grid = [[number, number], [number, number]]

export interface Product {
    name: string
    formula: string
    value: (a: Grid, b: Grid) => number
    /// Which output entries use this product, and with which sign.
    uses: Partial<Record<Entry, 1 | -1>>
}

export const schoolbook: Product[] = [
    { name: 'p1', formula: 'a11·b11', value: (a, b) => a[0][0] * b[0][0], uses: { c11: 1 } },
    { name: 'p2', formula: 'a12·b21', value: (a, b) => a[0][1] * b[1][0], uses: { c11: 1 } },
    { name: 'p3', formula: 'a11·b12', value: (a, b) => a[0][0] * b[0][1], uses: { c12: 1 } },
    { name: 'p4', formula: 'a12·b22', value: (a, b) => a[0][1] * b[1][1], uses: { c12: 1 } },
    { name: 'p5', formula: 'a21·b11', value: (a, b) => a[1][0] * b[0][0], uses: { c21: 1 } },
    { name: 'p6', formula: 'a22·b21', value: (a, b) => a[1][1] * b[1][0], uses: { c21: 1 } },
    { name: 'p7', formula: 'a21·b12', value: (a, b) => a[1][0] * b[0][1], uses: { c22: 1 } },
    { name: 'p8', formula: 'a22·b22', value: (a, b) => a[1][1] * b[1][1], uses: { c22: 1 } },
]

// Strassen, 1969.
export const strassen: Product[] = [
    { name: 'm1', formula: '(a11+a22)(b11+b22)', value: (a, b) => (a[0][0] + a[1][1]) * (b[0][0] + b[1][1]), uses: { c11: 1, c22: 1 } },
    { name: 'm2', formula: '(a21+a22)·b11', value: (a, b) => (a[1][0] + a[1][1]) * b[0][0], uses: { c21: 1, c22: -1 } },
    { name: 'm3', formula: 'a11·(b12−b22)', value: (a, b) => a[0][0] * (b[0][1] - b[1][1]), uses: { c12: 1, c22: 1 } },
    { name: 'm4', formula: 'a22·(b21−b11)', value: (a, b) => a[1][1] * (b[1][0] - b[0][0]), uses: { c11: 1, c21: 1 } },
    { name: 'm5', formula: '(a11+a12)·b22', value: (a, b) => (a[0][0] + a[0][1]) * b[1][1], uses: { c11: -1, c12: 1 } },
    { name: 'm6', formula: '(a21−a11)(b11+b12)', value: (a, b) => (a[1][0] - a[0][0]) * (b[0][0] + b[0][1]), uses: { c22: 1 } },
    { name: 'm7', formula: '(a12−a22)(b21+b22)', value: (a, b) => (a[0][1] - a[1][1]) * (b[1][0] + b[1][1]), uses: { c11: 1 } },
]

export const ENTRIES: Entry[] = ['c11', 'c12', 'c21', 'c22']

export const random = (): Grid => [
    [Math.floor(Math.random() * 19) - 9, Math.floor(Math.random() * 19) - 9],
    [Math.floor(Math.random() * 19) - 9, Math.floor(Math.random() * 19) - 9],
]

export function combine(products: Product[], a: Grid, b: Grid): Record<Entry, number> {
    const out = { c11: 0, c12: 0, c21: 0, c22: 0 }
    for (const product of products) {
        const v = product.value(a, b)
        for (const [entry, sign] of Object.entries(product.uses) as [Entry, number][]) out[entry] += sign * v
    }
    return out
}
