import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";
import { START_COPY, startSteps, type StartCardInput } from "@/lib/start-shop";

// The "Start your shop" card on Home. It takes the place of the normal panels while a shop is new (see showStartCard).
// Each of the three steps has a tick when it is done. The last step is optional.
export default function StartYourShop({ input, delay = 1 }: { input: StartCardInput; delay?: number }) {
  const done = startSteps(input);
  const ticks = [done.addItems, done.numbers, done.history];
  // The button to press now: the first step that is not done (past sales are optional, so they come last).
  const next = ticks.findIndex((t) => !t);
  return (
    <Glass as="section" aria-label={START_COPY.cardTitle} dots delay={delay} className="space-y-4 p-5">
      <h2><DotLabel>{START_COPY.cardTitle}</DotLabel></h2>
      <p className="text-sm text-ink-2">{START_COPY.cardLine}</p>
      <ol className="space-y-4">
        {START_COPY.steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0" aria-label={ticks[i] ? "Done" : "Not done yet"}>
              {ticks[i] ? <DotIcon name="check" size={26} /> : <span className="grid h-[26px] w-[26px] place-items-center rounded-full border border-line text-xs font-bold">{i + 1}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{s.title}{ticks[i] ? <span className="ml-2 text-xs font-normal text-ink-2">Done</span> : null}</span>
              <span className="block text-sm text-ink-2">{s.text}</span>
              <span className="mt-2 block"><Button href={s.href} variant={i === next ? "primary" : "ghost"} full>{ticks[i] ? `${s.button} again` : s.button}</Button></span>
            </span>
          </li>
        ))}
      </ol>
    </Glass>
  );
}
