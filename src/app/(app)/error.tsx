"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-foreground">
        <AlertTriangleIcon className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while fetching the latest data. Your changes are safe. Try again, and if it keeps
        happening, let an administrator know{error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
