"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { isSyntheticPlaceholderAwb } from "@/lib/admin/constants";
import {
  bookAdminOrderShipment,
  createManualOrderShipment,
} from "@/lib/admin/orders";

export interface ShipmentModalOrderTarget {
  id: string;
  order_number?: string | null;
  order_status: string;
  payment_method: string;
  payment_status: string;
  shipping_courier?: string | null;
  shipping_awb?: string | null;
  shipping_booking_mode?: string | null;
  shipping_booking_status?: string | null;
  shipping_last_error?: string | null;
}

interface AdminShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ShipmentModalOrderTarget | null;
  delhiveryConfigured?: boolean;
  delhiveryMockMode?: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const SUGGESTED_MANUAL_CARRIERS = ["India Post", "Blue Dart", "DTDC", "Professional Couriers", "Local Courier"];

function AdminShipmentModalContent({
  onClose,
  order,
  delhiveryConfigured = false,
  delhiveryMockMode = false,
  onSuccess,
  onError,
}: Omit<AdminShipmentModalProps, "isOpen"> & { order: ShipmentModalOrderTarget }) {
  const delhiveryAvailable = delhiveryConfigured || delhiveryMockMode;
  const bookingUncertain = order.shipping_booking_status === "booking_uncertain";

  const [mode, setMode] = useState<"delhivery" | "manual">(
    delhiveryAvailable && !bookingUncertain ? "delhivery" : "manual"
  );
  // Never pre-fill Delhivery or fabricate DLH-* AWB defaults for manual shipment entry
  const [carrierName, setCarrierName] = useState(
    order.shipping_booking_mode === "manual" && order.shipping_courier
      ? order.shipping_courier
      : ""
  );
  const [awb, setAwb] = useState(order.shipping_awb || "");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [markAsShipped, setMarkAsShipped] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isUnpaidOnline =
    String(order.payment_method || "").toUpperCase() === "ONLINE" &&
    order.payment_status !== "Paid";

  const handleBookDelhivery = async () => {
    setLocalError(null);
    if (!delhiveryAvailable) {
      setLocalError("Delhivery integration is not configured on this server. Use Manual Shipment Entry for alternative carriers.");
      return;
    }
    if (isUnpaidOnline) {
      setLocalError("Online prepaid orders must be Paid before booking a shipment.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await bookAdminOrderShipment(order.id);
      if (!res.success) {
        const msg = res.error || "Failed to book Delhivery shipment.";
        setLocalError(msg);
        onError(msg);
      } else {
        onClose();
        onSuccess(
          `Delhivery consignment booked successfully. Waybill AWB: ${res.awb}`
        );
      }
    } catch (err: any) {
      const msg = err?.message || "Delhivery booking failed.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    setLocalError(null);
    const trimmedCarrier = carrierName.trim();
    const trimmedAwb = awb.trim();
    const trimmedTrackingUrl = trackingUrl.trim();

    if (!trimmedCarrier) {
      setLocalError("Carrier / courier name is required for manual shipment entry.");
      return;
    }
    if (trimmedAwb && isSyntheticPlaceholderAwb(trimmedAwb)) {
      setLocalError("Synthetic DLH-* placeholder AWBs are not allowed.");
      return;
    }
    if (trimmedCarrier.toLowerCase() === "delhivery" && !trimmedAwb) {
      setLocalError("Manual Delhivery entry requires an existing Delhivery AWB, or use the Delhivery API tab.");
      return;
    }
    if (trimmedTrackingUrl && !/^https?:\/\//i.test(trimmedTrackingUrl)) {
      setLocalError("Tracking URL must start with http:// or https://.");
      return;
    }
    if (isUnpaidOnline) {
      setLocalError("Online prepaid orders must be Paid before dispatching.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createManualOrderShipment({
        orderId: order.id,
        carrierName: trimmedCarrier,
        awb: trimmedAwb || undefined,
        trackingUrl: trimmedTrackingUrl || undefined,
        markAsShipped,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        const msg = res.error || "Failed to record manual shipment.";
        setLocalError(msg);
        onError(msg);
      } else {
        onClose();
        onSuccess(
          `Manual shipment recorded with ${res.carrierName}${
            res.awb ? ` (Tracking: ${res.awb})` : " (no AWB provided)"
          }.`
        );
      }
    } catch (err: any) {
      const msg = err?.message || "Manual shipment entry failed.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#0E0E0E] border border-[#2A2A2A]">
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              setMode("delhivery");
            }}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition ${
              mode === "delhivery"
                ? "bg-[#C9A24A] text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Delhivery API Booking
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              setMode("manual");
            }}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition ${
              mode === "manual"
                ? "bg-[#C9A24A] text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Manual Shipment Entry
          </button>
        </div>

        {order.shipping_last_error && (
          <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-lg text-xs text-amber-200">
            <span className="font-semibold text-amber-300">Previous booking notice:</span>{" "}
            {order.shipping_last_error}
          </div>
        )}

        {isUnpaidOnline && (
          <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-xs text-red-300">
            This ONLINE order has payment status &ldquo;{order.payment_status}&rdquo;. Payment must be Paid before dispatch.
          </div>
        )}

        {localError && (
          <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-xs text-red-300">
            {localError}
          </div>
        )}

        {mode === "delhivery" ? (
          <div className="space-y-4 text-xs text-gray-300">
            <div className="p-4 rounded-lg bg-[#161616] border border-[#2A2A2A] space-y-2">
              <p className="font-semibold text-white">Automated Delhivery Dispatch</p>
              <p className="text-gray-400 leading-relaxed">
                Generates a verified Delhivery AWB, stores tracking URL and API response, and marks the order as{" "}
                <strong className="text-white">Shipped</strong>.
              </p>
              {!delhiveryAvailable && (
                <p className="text-amber-300 pt-1">
                  Delhivery credentials are not configured on the server. Switch to{" "}
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className="underline font-semibold"
                  >
                    Manual Shipment Entry
                  </button>{" "}
                  for third-party couriers.
                </p>
              )}
              {delhiveryMockMode && (
                <p className="text-amber-300 pt-1">
                  Mock Delhivery mode active for non-production local testing.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <Button
                onClick={handleBookDelhivery}
                variant="primary"
                disabled={submitting || !delhiveryAvailable || bookingUncertain || isUnpaidOnline}
              >
                {submitting ? "Booking..." : "Book Delhivery AWB"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-gray-400 uppercase mb-1">
                Carrier / Courier Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. India Post, Blue Dart, DTDC, Local Courier"
                className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SUGGESTED_MANUAL_CARRIERS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setCarrierName(suggestion)}
                    className="px-2 py-0.5 rounded bg-[#1A1A1A] hover:bg-[#242424] border border-[#2D2D2D] text-[11px] text-gray-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-400 uppercase mb-1">
                AWB / Tracking Reference <span className="text-gray-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
                placeholder="Enter real carrier AWB if issued (leave blank if unavailable)"
                className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-400 uppercase mb-1">
                Tracking URL <span className="text-gray-500 font-normal">(Optional, https://...)</span>
              </label>
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://carrier.example/track/..."
                className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-400 uppercase mb-1">
                Dispatch Note <span className="text-gray-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Dispatched via Registered Book Post receipt #..."
                className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              />
            </div>

            <label className="flex items-center gap-2 text-gray-300 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={markAsShipped}
                onChange={(e) => setMarkAsShipped(e.target.checked)}
                className="rounded border-gray-600 bg-[#161616]"
              />
              <span>Mark order status as Shipped immediately</span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <Button
                onClick={handleManualSubmit}
                variant="primary"
                disabled={submitting || !carrierName.trim() || isUnpaidOnline}
              >
                {submitting ? "Saving..." : "Save Manual Shipment"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

export function AdminShipmentModal({
  isOpen,
  onClose,
  order,
  delhiveryConfigured = false,
  delhiveryMockMode = false,
  onSuccess,
  onError,
}: AdminShipmentModalProps) {
  if (!order) return null;
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Fulfill & Ship Order #${displayOrderNum}`}
      description="Choose automated Delhivery consignment booking or enter details manually for another carrier."
    >
      {isOpen && (
        <AdminShipmentModalContent
          key={order.id}
          order={order}
          onClose={onClose}
          delhiveryConfigured={delhiveryConfigured}
          delhiveryMockMode={delhiveryMockMode}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </Modal>
  );
}
