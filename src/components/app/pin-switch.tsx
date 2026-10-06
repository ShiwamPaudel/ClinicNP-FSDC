"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

import type { Role } from "@/lib/repos/users";

export interface SwitchableUser {
  id: string;
  name: string;
  role: Role;
}

export function PinSwitch({ users }: { users: SwitchableUser[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SwitchableUser | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setSelected(null);
    setPin("");
  }

  async function submitPin() {
    if (!selected || pin.length !== 4) return;
    setBusy(true);
    const res = await signIn("pin", {
      userId: selected.id,
      pin,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      toast.error(strings.wrongPin);
      setPin("");
      return;
    }
    toast.success(`Switched to ${selected.name}`);
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50"
      >
        <UserCog className="h-4 w-4" />
        {strings.switchUser}
      </button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title={strings.switchUser}
      >
        {!selected ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-sage-500">Choose who's at the counter.</p>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className="flex items-center justify-between rounded-[8px] border border-line bg-cream-50 px-3 py-2.5 text-left hover:bg-cream-200"
              >
                <span className="text-[14px] font-medium text-sage-900">
                  {u.name}
                </span>
                <span className="text-[12px] text-sage-500">
                  {u.role === "admin" ? "Admin" : "Staff"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-sage-900">
              Enter PIN for <span className="font-semibold">{selected.name}</span>
            </p>
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={pin}
              numeric
              placeholder="••••"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              className={cn("text-center text-[20px] tracking-[0.5em]")}
            />
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={reset}>
                {strings.back}
              </Button>
              <Button onClick={submitPin} disabled={busy || pin.length !== 4}>
                {strings.switchUser}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
