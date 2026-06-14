export function parseChips(value: string): string[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export function addChip(chips: string[], value: string): string[] {
    const v = value.trim();
    if (v.length === 0) return chips;
    if (chips.some((c) => c.toLowerCase() === v.toLowerCase())) return chips;
    return [...chips, v];
}
