"use client";

import { useState } from "react";
import { Badge } from "@/frontend/components/ui/badge";
import { Input } from "@/frontend/components/ui/input";
import { addChip } from "@/frontend/lib/chips";

interface ChipsInputProps {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    id?: string;
}

export function ChipsInput({
    value,
    onChange,
    placeholder,
    id,
}: ChipsInputProps) {
    const [text, setText] = useState("");

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const raw = e.key === "," ? text : text;
            onChange(addChip(value, raw));
            setText("");
        }
    }

    function removeChip(idx: number) {
        onChange(value.filter((_, i) => i !== idx));
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
                {value.map((chip, idx) => (
                    <Badge
                        // chip values are user-supplied strings that may not be unique;
                        // combining chip + idx gives a stable key for this controlled list
                        // biome-ignore lint/suspicious/noArrayIndexKey: chips list is reordered only by add/remove, not sorting
                        key={`${chip}-${idx}`}
                        variant="secondary"
                        className="gap-1"
                    >
                        {chip}
                        <button
                            type="button"
                            onClick={() => removeChip(idx)}
                            className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Eliminar ${chip}`}
                        >
                            ×
                        </button>
                    </Badge>
                ))}
            </div>
            <Input
                id={id}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
            />
        </div>
    );
}
