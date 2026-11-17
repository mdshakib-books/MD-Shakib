import React, { Suspense } from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { getAdminOrders } from "@/lib/admin/orders";
import { getDelhiveryConfig } from "@/lib/integrations/delhivery/client";
import { AdminOrdersClient } from "./AdminOrdersClient";
import { Loader } from "@/components/ui/Loader";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const [{ profile }, params] = await Promise.all([
    requireStaffPermission("orders.view"),
    searchParams,
  ]);
  const page = parseInt(params.page || "1", 10) || 1;
  const status = params.status || "ALL";
  const paymentStatus = params.paymentStatus || "ALL";
  const paymentMethod = params.paymentMethod || "ALL";
  const search = params.search || "";

  const data = await getAdminOrders({
    status,
    paymentStatus,
    paymentMethod,
    search,
    page,
    limit: 20,
  });

  const delhivery = getDelhiveryConfig();

  return (
    <Suspense
      fallback={
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      }
    >
      <AdminOrdersClient
        initialOrders={data.orders}
        total={data.total}
        currentPage={data.page}
        totalPages={data.totalPages}
        currentStatus={status}
        currentPaymentStatus={paymentStatus}
        currentPaymentMethod={paymentMethod}
        currentSearch={search}
        delhiveryConfigured={delhivery.isConfigured}
        delhiveryMockMode={delhivery.allowMock}
        userRole={profile.role}
      />
    </Suspense>
  );
}

