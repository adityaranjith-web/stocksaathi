import LoginButton from "@/components/LoginButton";
import Glass from "@/components/ui/Glass";
import Button from "@/components/ui/Button";
import DotIcon from "@/components/ui/DotIcon";
import { isLive } from "@/lib/data";

const PROBLEMS: Record<string, string> = {
  signin: "Sign-in did not finish. Please try again. If it keeps happening, the project owner should check the Google sign-in settings (docs/live-setup.md).",
  denied: "Google did not allow the sign-in. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="pt-8">
      <Glass dots delay={0} className="space-y-4 p-6 text-center">
        <div className="mx-auto grid w-fit place-items-center"><DotIcon name="stock" size={56} /></div>
        <h1 className="text-2xl font-bold leading-tight">Welcome to StockSaathi</h1>
        <p className="text-ink-2">Your daily reorder list. Sign in with the Google account on your shop phone.</p>
        {error && <p role="alert" className="glass-alert rounded-[16px] border p-3 text-sm font-semibold">{PROBLEMS[error] ?? PROBLEMS.signin}</p>}
        {isLive ? (
          <LoginButton />
        ) : (
          <>
            <p className="text-sm font-semibold">This is demo mode. No sign-in is needed.</p>
            <Button href="/" full icon="next">Open the demo</Button>
          </>
        )}
        <p className="text-xs text-ink-2">We store only your name and email to sign you in. No customer details are stored.</p>
      </Glass>
    </div>
  );
}
