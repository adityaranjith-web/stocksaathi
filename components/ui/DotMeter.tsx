// A row of 10 dots, lit from the left: a tiny instrument bar. value is 0 to 1.
// Always shown next to the number in words, so it is a decoration, not the only signal.
export default function DotMeter({ value, className = "" }: { value: number; className?: string }) {
  const lit = Math.max(0, Math.min(10, Math.round(value * 10)));
  return (
    <svg viewBox="0 0 40 4" width={50} height={5} fill="currentColor" className={className} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={2 + i * 4} cy={2} r={1.5} opacity={i < lit ? 1 : 0.25} />)}
    </svg>
  );
}
