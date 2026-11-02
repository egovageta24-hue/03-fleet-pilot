"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { updateSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generalSettingsSchema, type GeneralSettings } from "@/lib/validation/settings";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function GeneralSettingsForm({
  initial,
  timezones,
  readOnly,
}: {
  initial: GeneralSettings;
  timezones: string[];
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<GeneralSettings>({ resolver: zodResolver(generalSettingsSchema), defaultValues: initial });

  function onSubmit(values: GeneralSettings) {
    startTransition(async () => {
      const res = await updateSettingsAction(values);
      if (res.ok) {
        toast.success("Settings saved");
        reset(res.data);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-5" noValidate>
      {readOnly && (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          You can view these settings but only an administrator can change them.
        </p>
      )}
      <fieldset disabled={readOnly || pending} className="grid gap-5 disabled:opacity-80">
        <Field id="companyName" label="Company name" error={errors.companyName?.message}>
          <Input id="companyName" {...register("companyName")} />
        </Field>

        <Field
          id="timezone"
          label="Timezone"
          hint="“Today” on the dashboard, in reports and in exports is this timezone’s calendar day."
          error={errors.timezone?.message}
        >
          <Input id="timezone" list="timezone-options" autoComplete="off" {...register("timezone")} />
          <datalist id="timezone-options">
            {timezones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="atRiskMinutes"
            label="At-risk threshold (minutes)"
            hint="Open orders whose window ends within this time are flagged “at risk”."
            error={errors.atRiskMinutes?.message}
          >
            <Input id="atRiskMinutes" type="number" min={5} max={240} {...register("atRiskMinutes", { valueAsNumber: true })} />
          </Field>
          <Field
            id="defaultWindowMinutes"
            label="Default delivery window (minutes)"
            hint="Pre-filled when a new order is created."
            error={errors.defaultWindowMinutes?.message}
          >
            <Input id="defaultWindowMinutes" type="number" min={30} max={720} {...register("defaultWindowMinutes", { valueAsNumber: true })} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="operatingStart" label="Operating hours start" error={errors.operatingStart?.message}>
            <Input id="operatingStart" type="time" {...register("operatingStart")} />
          </Field>
          <Field id="operatingEnd" label="Operating hours end" error={errors.operatingEnd?.message}>
            <Input id="operatingEnd" type="time" {...register("operatingEnd")} />
          </Field>
        </div>
      </fieldset>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !isDirty}>
            {pending && <Loader2Icon className="animate-spin" />} Save changes
          </Button>
          {isDirty && !pending && (
            <Button type="button" variant="ghost" onClick={() => reset(initial)}>
              Discard
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
