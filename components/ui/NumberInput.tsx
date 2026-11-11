"use client";
import DotIcon from "./DotIcon";

// Quantity box with big minus and plus buttons (each 48px). The number is shown in dot-matrix.
// The value can also be typed. It never goes below min.
export default function NumberInput({
  id, label, value, onChange, min = 0, max = 99999,
}: { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" className="icon-btn" aria-label={`Less ${label}`} onClick={() => onChange(clamp(value - 1))}><DotIcon name="minus" size={22} /></button>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id} className="field dot-number text-center" style={{ width: "4.5rem", fontSize: 26 }}
        type="number" inputMode="numeric" min={min} max={max} value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value || "0", 10)))}
      />
      <button type="button" className="icon-btn" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + 1))}><DotIcon name="plus" size={22} /></button>
    </div>
  );
}
