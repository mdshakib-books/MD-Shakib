import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNavClient } from "./AdminNavClient";

export const metadata = {
  title: "Admin Portal | MD Shakib Islamic Books",
  description: "Administrative dashboard and lifecycle management operations",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white flex flex-col lg:flex-row">
      <AdminNavClient
        adminName={profile.name || "Administrator"}
        adminEmail={profile.email || ""}
      />
      <main className="flex-1 overflow-x-hidden min-h-[calc(100vh-60px)] lg:min-h-screen p-4 sm:p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}

