"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DISPATCHED_ORDER_STATUSES, isDelhiveryShipment } from "@/lib/admin/constants";
import { cancelAdminOrder } from "@/lib/admin/orders";

export interface CancelModalOrderTarget {
  id: string;
  order_number?: string | null;
  order_status: string;
  payment_method: string;
  payment_status: string;
  shipping_courier?: string | null;
  shipping_awb?: string | null;
  shipping_booking_mode?: string | null;
  shipping_tracking_url?: string | null;
}

interface AdminCancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CancelModalOrderTarget | null;
  onSuccess: (message: string) => void;
  onError: (message: string, orderCancelled?: boolean) => void;
}

function AdminCancelOrderModalContent({
  onClose,
  order,
  onSuccess,
  onError,
}: Omit<AdminCancelOrderModalProps, "isOpen"> & { order: CancelModalOrderTarget }) {
  const [cancelReason, setCancelReason] = useState("");
  const [confirmManualHalt, setConfirmManualHalt] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isDispatched = DISPATCHED_ORDER_STATUSES.has(order.order_status);
  const isDelhivery = isDelhiveryShipment({
    courier: order.shipping_courier,
    bookingMode: order.shipping_booking_mode,
    trackingUrl: order.shipping_tracking_url,
  });
  const requiresManualCourierConfirmation = isDispatched && !isDelhivery;
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  const handleConfirm = async () => {
    setLocalError(null);
    if (!cancelReason.trim()) {
      setLocalError("Cancellation reason is required.");
      return;
    }
    if (requiresManualCourierConfirmation && (!confirmManualHalt || !manualRef.trim())) {
      setLocalError(
        "Please confirm external courier halt/cancellation and provide a confirmation note or reference."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await cancelAdminOrder({
        orderId: order.id,
        reason: cancelReason.trim(),
        confirmManualCourierCancellation: requiresManualCourierConfirmation
          ? confirmManualHalt
          : undefined,
        manualConfirmationRef: requiresManualCourierConfirmation
          ? manualRef.trim()
          : undefined,
      });

      if (!res.success) {
        const msg = res.error || "Failed to cancel order.";
        setLocalError(msg);
        onError(msg, res.orderCancelled);
      } else {
        const suffix =
          res.refundStatus === "PROCESSED"
            ? " Refund processed via Razorpay."
            : res.refundStatus === "PROCESSING"
            ? " Refund initiated via Razorpay."
            : "";
        onClose();
        onSuccess(
          isDispatched
            ? `Order #${displayOrderNum} cancelled after courier confirmation (inventory held pending return).${suffix}`
            : `Order #${displayOrderNum} cancelled and inventory restored.${suffix}`
        );
      }
    } catch (err: any) {
      const msg = err?.message || "Cancellation failed.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pt-2 text-xs">
      {isDispatched && (
        <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-lg text-amber-200 space-y-1">
          <p className="font-semibold text-amber-300">
            Order is currently {order.order_status} ({order.shipping_courier || "Carrier"}
            {order.shipping_awb ? ` · AWB ${order.shipping_awb}` : ""})
          </p>
          {isDelhivery ? (
            <p>
              Submitting will call Delhivery cancellation API first. If Delhivery rejects or times out, the order remains{" "}
              <strong>{order.order_status}</strong>.
            </p>
          ) : (
            <p>
              Confirm below that the third-party carrier has halted delivery before cancelling this order. Shelf inventory will not be automatically restocked.
            </p>
          )}
        </div>
      )}

      {localError && (
        <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-red-300">
          {localError}
        </div>
      )}

      {requiresManualCourierConfirmation && (
        <div className="space-y-3 p-3 rounded-lg bg-[#161616] border border-[#2A2A2A]">
          <label className="flex items-start gap-2 text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmManualHalt}
              onChange={(e) => setConfirmManualHalt(e.target.checked)}
              className="mt-0.5 rounded border-gray-600 bg-[#0B0B0B]"
            />
            <span>
              I confirm that{" "}
              <strong>{order.shipping_courier || "the external carrier"}</strong> has confirmed cancellation / return-to-origin for this dispatch.
            </span>
          </label>
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Courier Confirmation Reference / Note <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              placeholder="e.g. Spoke with Blue Dart hub supervisor (#REF-901)"
              className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block font-semibold text-gray-400 uppercase mb-1">
          Cancellation Reason <span className="text-red-400">*</span>
        </label>
        <textarea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g., Customer requested cancellation, address unreachable..."
          className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Close
        </button>
        <Button
          onClick={handleConfirm}
          variant="outline"
          disabled={submitting}
          className="border-red-600 text-red-400 hover:bg-red-950"
        >
          {submitting
            ? isDispatched && isDelhivery
              ? "Confirming with Delhivery..."
              : "Cancelling..."
            : isDispatched
            ? "Confirm Courier & Cancel Order"
            : "Cancel Order"}
        </Button>
      </div>
    </div>
  );
}

export function AdminCancelOrderModal({
  isOpen,
  onClose,
  order,
  onSuccess,
  onError,
}: AdminCancelOrderModalProps) {
  if (!order) return null;

  const isDispatched = DISPATCHED_ORDER_STATUSES.has(order.order_status);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isDispatched
          ? "Cancel Dispatched Order (Courier Confirmation Required)"
          : "Cancel Order & Restore Inventory"
      }
      description={
        isDispatched
          ? "Dispatched orders require confirmed courier cancellation before the order can be marked Cancelled."
          : "This action cancels the pre-dispatch order, restores reserved stock, and triggers a refund if prepaid."
      }
    >
      {isOpen && (
        <AdminCancelOrderModalContent
          key={order.id}
          order={order}
          onClose={onClose}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </Modal>
  );
}
