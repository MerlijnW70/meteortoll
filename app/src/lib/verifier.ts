const RUNNING = 0
const HOLDS = 1
const FAILS = 2
const MALFORMED = -1

const STATE_LEN = 60
const POINT_END = 31
const OFFSET_AT = 31
const FIRST_PRODUCT = 7n

function rewind(saved: Uint8Array): Uint8Array {
    const state = new Uint8Array(STATE_LEN)
    state.set(saved.subarray(0, POINT_END))
    new DataView(state.buffer).setBigUint64(OFFSET_AT, FIRST_PRODUCT, true)
    return state
}

export type Verdict = 'running' | 'holds' | 'fails' | 'malformed'

const verdicts: Record<number, Verdict> = { [RUNNING]: 'running', [HOLDS]: 'holds', [FAILS]: 'fails', [MALFORMED]: 'malformed' }

interface Exports {
    memory: WebAssembly.Memory
    alloc(len: number): number
    dealloc(pointer: number, len: number): void
    start(scheme: number, len: number, seed: number): number
    start_from_state(scheme: number, len: number, state: number): number
    step(budget: number): number
    rank(): number
    triples_total(): number
    products_done(): number
    direct_done(): number
    lhs(): bigint
    rhs(): bigint
}

export interface Progress {
    verdict: Verdict
    rank: number
    productsDone: number
    triplesTotal: number
    directDone: boolean
    lhs: bigint
    rhs: bigint
}

export class Verifier {
    private constructor(private readonly wasm: Exports) {}

    static async load(bytes: BufferSource | Promise<BufferSource>): Promise<Verifier> {
        const { instance } = await WebAssembly.instantiate(await bytes, {})
        return new Verifier(instance.exports as unknown as Exports)
    }

    private copyIn(data: Uint8Array): number {
        const pointer = this.wasm.alloc(data.length)
        new Uint8Array(this.wasm.memory.buffer, pointer, data.length).set(data)
        return pointer
    }

    start(scheme: Uint8Array, seed: Uint8Array): boolean {
        if (seed.length !== 32) throw new Error('seed must be 32 bytes')
        const schemePointer = this.copyIn(scheme)
        const seedPointer = this.copyIn(seed)
        const code = this.wasm.start(schemePointer, scheme.length, seedPointer)
        this.wasm.dealloc(schemePointer, scheme.length)
        this.wasm.dealloc(seedPointer, 32)
        return code === RUNNING
    }

    startFromAttempt(scheme: Uint8Array, saved: Uint8Array): boolean {
        if (saved.length !== STATE_LEN) throw new Error(`saved state must be ${STATE_LEN} bytes`)
        const rewound = rewind(saved)
        const schemePointer = this.copyIn(scheme)
        const statePointer = this.copyIn(rewound)
        const code = this.wasm.start_from_state(schemePointer, scheme.length, statePointer)
        this.wasm.dealloc(schemePointer, scheme.length)
        this.wasm.dealloc(statePointer, STATE_LEN)
        return code === RUNNING
    }

    step(budget: number): Progress {
        const verdict = verdicts[this.wasm.step(budget)] ?? 'malformed'
        return this.progress(verdict)
    }

    progress(verdict: Verdict = 'running'): Progress {
        return {
            verdict,
            rank: this.wasm.rank(),
            productsDone: this.wasm.products_done(),
            triplesTotal: this.wasm.triples_total(),
            directDone: this.wasm.direct_done() === 1,
            lhs: BigInt.asUintN(64, this.wasm.lhs()),
            rhs: BigInt.asUintN(64, this.wasm.rhs()),
        }
    }

    verify(scheme: Uint8Array, seed: Uint8Array): Progress {
        if (!this.start(scheme, seed)) return this.progress('malformed')
        let state = this.step(0xffffffff)
        while (state.verdict === 'running') state = this.step(0xffffffff)
        return state
    }
}

let shared: Promise<Verifier> | null = null

export function sharedVerifier(): Promise<Verifier> {
    shared ??= Verifier.load(
        fetch('/verifier.wasm').then((response) => {
            if (!response.ok) throw new Error(`the verifier could not be downloaded (HTTP ${response.status})`)
            return response.arrayBuffer()
        })
    ).catch((error) => {
        shared = null
        throw new Error(`The in-browser verifier could not load. Check your connection and try again. (${error instanceof Error ? error.message : error})`)
    })
    return shared
}
