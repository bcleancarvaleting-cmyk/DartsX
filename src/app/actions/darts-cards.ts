"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { setDarterLook } from "@/server/darts-card-admin";
import { type ActionResult, attempt } from "./result";

export async function darterLookAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const reset = form.get("reset") === "1";
  const res = await attempt(
    () =>
      setDarterLook(admin.id, String(form.get("playerId") ?? ""), {
        c1: String(form.get("c1") ?? ""),
        c2: String(form.get("c2") ?? ""),
        c3: String(form.get("c3") ?? ""),
        pattern: String(form.get("pattern") ?? ""),
        nickname: String(form.get("nickname") ?? ""),
        reset,
      }),
    reset ? "Back to their country's colours." : "Saved — every copy of their card shows it now.",
  );
  revalidatePath("/", "layout");
  return res;
}
