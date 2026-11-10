export type StaffRole =
  | "super_admin"
  | "admin"
  | "order_manager"
  | "warehouse_staff"
  | "support_staff"
  | "user";

export type StaffPermission =
  | "dashboard.view"
  | "orders.view"
  | "orders.manage"
  | "orders.cancel"
  | "orders.ship"
  | "orders.settle_cod"
  | "orders.export"
  | "customers.export"
  | "reports.view"
  | "returns.manage"
  | "delivery.verify"
  | "books.view"
  | "books.manage"
  | "inventory.view"
  | "inventory.manage"
  | "discounts.manage"
  | "reviews.manage"
  | "support.manage"
  | "users.view"
  | "users.manage_roles"
  | "audit.view";

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  super_admin: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "orders.cancel",
    "orders.ship",
    "orders.settle_cod",
    "orders.export",
    "customers.export",
    "reports.view",
    "returns.manage",
    "delivery.verify",
    "books.view",
    "books.manage",
    "inventory.view",
    "inventory.manage",
    "discounts.manage",
    "reviews.manage",
    "support.manage",
    "users.view",
    "users.manage_roles",
    "audit.view",
  ],
  admin: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "orders.cancel",
    "orders.ship",
    "orders.settle_cod",
    "orders.export",
    "customers.export",
    "reports.view",
    "returns.manage",
    "delivery.verify",
    "books.view",
    "books.manage",
    "inventory.view",
    "inventory.manage",
    "discounts.manage",
    "reviews.manage",
    "support.manage",
    "users.view",
    "audit.view",
  ],
  order_manager: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "orders.cancel",
    "orders.settle_cod",
    "orders.export",
    "returns.manage",
    "books.view",
    "inventory.view",
    "support.manage",
  ],
  warehouse_staff: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "orders.ship",
    "returns.manage",
    "delivery.verify",
    "inventory.view",
    "books.view",
  ],
  support_staff: [
    "dashboard.view",
    "orders.view",
    "returns.manage",
    "reviews.manage",
    "support.manage",
  ],
  user: [],
};

export function hasPermission(role: string, permission: StaffPermission): boolean {
  const staffRole = (role || "user") as StaffRole;
  const permissions = ROLE_PERMISSIONS[staffRole] || [];
  return permissions.includes(permission);
}

export function isStaffRole(role: string): boolean {
  return ["super_admin", "admin", "order_manager", "warehouse_staff", "support_staff"].includes(role);
}

export function getRoleDisplayName(role: string): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Administrator";
    case "order_manager":
      return "Order Manager";
    case "warehouse_staff":
      return "Warehouse / Fulfilment";
    case "support_staff":
      return "Customer Support";
    case "user":
      return "Customer";
    default:
      return role;
  }
}
