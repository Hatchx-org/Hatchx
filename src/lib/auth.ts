import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAllowedEmail } from "@/lib/email-access";
import type { Role, SessionUser } from "@/lib/supabase/types";

/** Supabase Auth proves identity; profiles.role supplies app authorization. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Preserve legacy Staff/Advisor values until the database migration changes
  // them. Permission helpers understand both schemas during a rolling deploy.
  const role: Role = profile && ["student", "teacher", "advisor", "staff", "admin"].includes(profile.role)
    ? profile.role
    : "student";

  return {
    id: user.id,
    email: user.email ?? "",
    name:
      user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "student",
    avatarUrl: user.user_metadata?.avatar_url ?? null,
    role,
  };
});

export function canAccess(routeRole: Role[], userRole: Role | undefined) {
  return Boolean(userRole) && routeRole.includes(userRole as Role);
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!(["staff", "admin"] as Role[]).includes(user.role)) redirect("/");
  return user;
}
