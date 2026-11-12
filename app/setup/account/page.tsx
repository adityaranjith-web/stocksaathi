import Link from "next/link";
import { getStore, isLive } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import SignOutButton from "@/components/SignOutButton";
import DotIcon from "@/components/ui/DotIcon";

export const dynamic = "force-dynamic";

// BRD section 7: sign out, or delete the account and all shop data.
export default async function AccountPage() {
  const me = await requireOwner();
  const shop = await getStore().getShop();
  return (
    <div className="space-y-4">
      <div className="rise px-1">
        <Link href="/more" className="inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />More</Link>
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="text-sm text-ink-2">Signed in as {me.name}. Shop: {shop.name}.</p>
      </div>
      {isLive && <SignOutButton />}
      <DeleteAccountForm shopName={shop.name} live={isLive} />
    </div>
  );
}
