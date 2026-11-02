import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/permissions";
import { requireActor } from "@/server/auth/dal";

// "/" has no content of its own: send everyone to the landing page for their role.
export default async function Home() {
  const actor = await requireActor();
  redirect(homePathFor(actor.role));
}
