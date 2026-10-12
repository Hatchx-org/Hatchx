import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import Pagination from "@/components/pagination";
import UserRoleForm from "./user-role-form";

const PAGE_SIZE = 25;

export const metadata: Metadata = {
  title: "Manage Users — Admin",
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const configured = isSupabaseConfigured();

  const supabase = configured ? await createServerClient() : null;
  const { data: clubs } = supabase ? await supabase.from("clubs").select("id,name").order("name") : { data: [] };
  let { data: rows, count, error: usersError } = supabase
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, role, grade_level, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
    : { data: null, count: 0, error: null };
  if (supabase && usersError?.code === "42703") {
    const fallback = await supabase.from("profiles").select("id,email,full_name,role,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    rows = fallback.data?.map((row) => ({ ...row, grade_level: null })) ?? null;
    count = fallback.count;
    usersError = fallback.error;
  }
  const profileIds = rows?.map(row => row.id) ?? [];
  const { data: permissionRows } = supabase && profileIds.length
    ? await supabase.from("teacher_permissions").select("profile_id,permission").in("profile_id", profileIds)
    : { data: [] };
  const { data: advisorRows } = supabase && profileIds.length
    ? await supabase.from("club_advisors").select("profile_id,club_id").in("profile_id", profileIds)
    : { data: [] };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Manage Users"
        subtitle="View member accounts and update roles. Changes take effect immediately on their next request."
      />

      {!configured ? (
        <div className="mb-6 rounded-card border border-orange/30 bg-orange/10 p-4 text-sm leading-6 text-ink">
          <strong>Supabase is not configured.</strong> Add{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="font-mono text-xs">.env.local</code>, then apply{" "}
          <code className="font-mono text-xs">supabase/profiles.sql</code> in the Supabase
          SQL Editor to manage users.
        </div>
      ) : (
        <section className="mt-4 rounded-card border border-black/5 bg-card shadow-sm">
          {!rows || rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              No users yet. Accounts are created automatically when members sign in.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {row.full_name || row.email}
                    </p>
                    <p className="truncate text-xs text-muted">{row.email}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Signed up{" "}
                      {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                        new Date(row.created_at),
                      )}
                    </p>
                  </div>
                  <UserRoleForm id={row.id} role={(["staff", "advisor"].includes(row.role) ? "teacher" : row.role) as "student" | "teacher" | "admin"} gradeLevel={row.grade_level} permissions={permissionRows?.filter(item => item.profile_id === row.id).map(item => item.permission) ?? []} clubs={clubs ?? []} assignedClubIds={advisorRows?.filter(item => item.profile_id === row.id).map(item => item.club_id) ?? []} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Pagination basePath="/admin/users" page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
    </div>
  );
}
