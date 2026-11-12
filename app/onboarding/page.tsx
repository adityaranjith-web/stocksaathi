import { redirect } from "next/navigation";
import { isLive } from "@/lib/data";
import { getAccess } from "@/lib/auth";
import CreateShopForm from "@/components/CreateShopForm";
import SignOutButton from "@/components/SignOutButton";
import Glass from "@/components/ui/Glass";
import { DotLabel } from "@/components/ui/DotText";

export const dynamic = "force-dynamic";

// Shown to a signed-in Google user who has no shop and no helper invite.
export default async function OnboardingPage() {
  if (!isLive) redirect("/"); // demo mode has no accounts
  const a = await getAccess();
  if (a.state === "ok") redirect(a.me.role === "owner" ? "/" : "/sell");
  if (a.state === "signed-out") redirect("/login");
  if (a.state === "error") throw new Error(a.message);

  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <h1 className="text-2xl font-bold">Create your shop</h1>
        <p className="text-sm text-ink-2">You are signed in. Tell us about your shop to start. If a shop owner invited you as a helper, sign out and ask them to add your Google email first.</p>
      </div>

      <Glass blur={false} delay={1} className="space-y-3 p-4 text-sm">
        <h2><DotLabel>Privacy notice</DotLabel></h2>
        <p><b>What we keep.</b> Your name and Google email, so you can sign in. The shop details, items, sales, orders and deliveries that you or your helpers enter. Your helpers&apos; names and Google emails.</p>
        <p><b>What we do not keep.</b> Customer names or phone numbers, your location, photos, or payment details.</p>
        <p><b>Who can see it.</b> Only you and the helpers you add. A helper can only record sales. The StockSaathi team can see error logs, not your shop records.</p>
        <p><b>Why.</b> To sign you in and to work out what you should reorder.</p>
        <p><b>Your rights.</b> You can delete your account and all your shop data at any time: More, then Your account. Deleting is how you take back this consent. We follow India&apos;s Digital Personal Data Protection Act, 2023.</p>
      </Glass>

      <CreateShopForm />
      <SignOutButton />
    </div>
  );
}
