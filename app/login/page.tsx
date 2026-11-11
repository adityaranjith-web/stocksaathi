import LoginButton from "@/components/LoginButton";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";

export default function LoginPage() {
  return (
    <div className="pt-8">
      <Glass dots delay={0} className="space-y-4 p-6 text-center">
        <div className="mx-auto grid w-fit place-items-center"><DotIcon name="stock" size={56} /></div>
        <h1 className="text-2xl font-bold leading-tight">Welcome to StockSaathi</h1>
        <p className="text-ink-2">Your daily reorder list. Sign in with the Google account on your shop phone.</p>
        <LoginButton />
        <p className="text-xs text-ink-2">We store only your name and email to sign you in. No customer details are stored.</p>
      </Glass>
    </div>
  );
}
