'use client'

import { type DragEvent, useId, useState } from 'react'

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
    const [dragging, setDragging] = useState(false)
    const id = useId()
    const onDrop = (event: DragEvent) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
    }
    return (
        <label
            htmlFor={id}
            onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`block cursor-pointer rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors focus-within:border-accent ${
                dragging ? 'border-accent bg-accent/5' : 'border-border bg-panel hover:border-accent/50'
            }`}
        >
            <span aria-hidden className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent text-xl text-bg">
                ↑
            </span>
            <span className="block text-lg font-semibold">Drop your scheme file here</span>
            <span className="mt-1 block text-sm text-muted">or tap to choose one · free, and it never leaves your browser</span>
            <input
                id={id}
                type="file"
                accept=".json,.bin,application/json,application/octet-stream"
                className="sr-only"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onFile(file)
                    e.target.value = ''
                }}
            />
        </label>
    )
}
