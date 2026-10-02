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
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors focus-within:border-accent ${
                dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
            }`}
        >
            <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-accent/15 text-lg text-accent">
                ↑
            </span>
            <span className="block font-medium">Drop your scheme file here</span>
            <span className="mt-1 block text-sm text-muted">or click to choose one · free, and it never leaves your browser</span>
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
