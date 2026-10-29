import React from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading admin users:", error.message);
  }

  const allProfiles = profiles || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            User Accounts
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Registered customer and administrator accounts in the bookstore.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Users: <span className="font-bold text-white">{allProfiles.length}</span>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {allProfiles.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No user accounts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Account Status</th>
                  <th className="py-3.5 px-4 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {allProfiles.map((user) => (
                  <tr key={user.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{user.name || "Customer"}</div>
                      <div className="font-mono text-[10px] text-gray-500">{user.id.slice(0, 13)}...</div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-300">{user.email || "—"}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={user.role === "admin" ? "gold" : "muted"}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={user.is_blocked ? "danger" : "success"}>
                        {user.is_blocked ? "Blocked" : "Active"}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right text-xs text-gray-400">
                      {new Date(user.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

