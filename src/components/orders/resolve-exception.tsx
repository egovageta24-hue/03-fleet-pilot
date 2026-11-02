"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { resolveExceptionAction } from "@/app/(app)/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResolveException({ exceptionId }: { exceptionId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await resolveExceptionAction({ exceptionId, resolutionNote: note });
      if (res.ok) {
        toast.success("Exception resolved");
        setOpen(false);
        setNote("");
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CheckIcon /> Resolve
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-wrap items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="How was it resolved?"
        aria-label="Resolution note"
        maxLength={500}
        autoFocus
        className="min-w-48 flex-1"
      />
      <Button type="submit" size="sm" disabled={pending || !note.trim()}>
        {pending && <Loader2Icon className="animate-spin" />} Resolve
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
