"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRoundIcon, Loader2Icon, UserPlusIcon } from "lucide-react";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/app/(app)/settings/actions";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { USER_ROLES, type UserRole } from "@/lib/domain";
import type { UserRow } from "@/server/admin/users";

const ROLE_LABEL: Record<UserRole, string> = { admin: "Administrator", dispatcher: "Dispatcher", manager: "Operations manager", driver: "Driver" };
const STAFF_ROLES: UserRole[] = ["admin", "dispatcher", "manager"];

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("dispatcher");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createUserAction({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role,
        phone: role === "driver" ? form.get("phone") : undefined,
      });
      if (res.ok) {
        toast.success(`Account created for ${res.data.email}`);
        onOpenChange(false);
      } else setError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>They can sign in straight away with the password you set. Ask them to keep it private.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" name="name" required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="new-role" className="w-full">
                <SelectValue>{ROLE_LABEL[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "driver" && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-phone">Phone</Label>
              <Input id="new-phone" name="phone" type="tel" required />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">Initial password</Label>
            <Input id="new-password" name="password" type="password" minLength={10} required autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">At least 10 characters.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setError(null);
    startTransition(async () => {
      const res = await resetPasswordAction({ userId: user.id, password });
      if (res.ok) {
        toast.success(`Password reset for ${user.name}`);
        onClose();
      } else setError(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {user.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="reset-password">New password</Label>
            <Input id="reset-password" name="password" type="password" minLength={10} required autoFocus autoComplete="new-password" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function change(userId: string, patch: { role?: UserRole; active?: boolean }, success: string) {
    setPendingId(userId);
    startTransition(async () => {
      const res = await updateUserAction({ userId, ...patch });
      setPendingId(null);
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{users.length} accounts</p>
        <Button onClick={() => setAdding(true)}>
          <UserPlusIcon /> Add user
        </Button>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {users.map((u) => {
          const self = u.id === currentUserId;
          const busy = pendingId === u.id;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4">
              <DriverAvatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">
                  {u.name} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>

              {u.role === "driver" ? (
                <span className="w-44 text-sm text-muted-foreground">Driver</span>
              ) : (
                <Select value={u.role} disabled={self || busy} onValueChange={(v) => change(u.id, { role: v as UserRole }, `${u.name} is now ${ROLE_LABEL[v as UserRole]}`)}>
                  <SelectTrigger className="w-44" aria-label={`Role for ${u.name}`}>
                    <SelectValue>{ROLE_LABEL[u.role]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={u.active}
                  disabled={self || busy}
                  onCheckedChange={(v) => change(u.id, { active: v }, `${u.name} ${v ? "reactivated" : "deactivated"}`)}
                  aria-label={`${u.name} active`}
                />
                <span className={u.active ? "" : "text-muted-foreground"}>{u.active ? "Active" : "Inactive"}</span>
              </label>

              <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                <KeyRoundIcon /> Reset password
              </Button>
            </li>
          );
        })}
      </ul>

      {adding && <AddUserDialog open onOpenChange={(o) => !o && setAdding(false)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
