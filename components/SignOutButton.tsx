"use client";
import Button from "@/components/ui/Button";
import { signOutHere } from "@/lib/sign-out";

// Signs out on this phone, then goes to the sign-in page. Live mode only. (More > Your account.)
export default function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "primary" }) {
  return <Button type="button" full variant={variant} onClick={() => signOutHere()}>Sign out</Button>;
}
