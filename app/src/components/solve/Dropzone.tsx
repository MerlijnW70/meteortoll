'use client'

import { type DragEvent, useId, useState } from 'react'

/// A native file input under a large drop target: keyboard and screen readers get the real
/// input, mouse users can drop or click anywhere on the target.
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
            <span className="block font-medium">Drop an fmm scheme (.json) or an encoded scheme (.bin)</span>
            <span className="mt-1 block text-sm text-muted">or click to choose a file · up to 5 MB</span>
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
