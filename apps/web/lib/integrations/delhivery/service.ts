import crypto from "crypto";
import { getDelhiveryConfig } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendShipmentNotification } from "@/lib/integrations/resend/service";
import { logger } from "@/lib/logger";
import { isMockTokenValue, isPlaceholderValue, type ServiceExecutionMode } from "@/lib/env/shared";
import { isDelhiveryShipment, resolveOrderTrackingUrl } from "@/lib/admin/constants";
import { reconcileCourierRemittance } from "@/lib/delivery/cod";

export class DelhiveryConfigurationError extends Error {
  constructor(message = "Delhivery credentials are not configured on the server.") {
    super(message);
    this.name = "DelhiveryConfigurationError";
  }
}

export class DelhiveryDisabledError extends DelhiveryConfigurationError {
  constructor(
    message = "Delhivery integration is disabled or DELHIVERY_TOKEN is not configured on the server."
  ) {
    super(message);
    this.name = "DelhiveryDisabledError";
  }
}

export class DelhiveryServiceabilityTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Delhivery serviceability request timed out after ${timeoutMs}ms.`);
    this.name = "DelhiveryServiceabilityTimeoutError";
  }
}

export class DelhiveryRequestTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Delhivery ${operation} request timed out after ${timeoutMs}ms.`);
    this.name = "DelhiveryRequestTimeoutError";
  }
}

const DEFAULT_DELHIVERY_TIMEOUT_MS = 5000;
const DEFAULT_DELHIVERY_MUTATION_TIMEOUT_MS = 10000;
const POSITIVE_SERVICEABILITY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (positive-only)
const MAX_SERVICEABILITY_CACHE_ENTRIES = 500;

async function fetchDelhiveryWithTimeout(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; operation: string; fetchFn?: typeof fetch }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const fetcher = options.fetchFn || fetch;

  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      throw new DelhiveryRequestTimeoutError(options.operation, options.timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

interface CachedServiceabilityEntry {
  value: PincodeServiceabilityResult;
  expiresAt: number;
}

const positiveServiceabilityCache = new Map<string, CachedServiceabilityEntry>();

/**
 * Clears the bounded in-memory positive serviceability cache (used in tests and config refreshes).
 */
export function clearPincodeServiceabilityCache(): void {
  positiveServiceabilityCache.clear();
}

function getPositiveCachedServiceability(cacheKey: string): PincodeServiceabilityResult | null {
  const entry = positiveServiceabilityCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    positiveServiceabilityCache.delete(cacheKey);
    return null;
  }
  return { ...entry.value, cached: true };
}

function setPositiveCachedServiceability(cacheKey: string, value: PincodeServiceabilityResult): void {
  // Never cache unserviceable, non-verified, or mock responses
  if (!value.serviceable || value.isMock || !value.verified) {
    return;
  }
  if (positiveServiceabilityCache.size >= MAX_SERVICEABILITY_CACHE_ENTRIES) {
    const oldestKey = positiveServiceabilityCache.keys().next().value;
    if (oldestKey) {
      positiveServiceabilityCache.delete(oldestKey);
    }
  }
  positiveServiceabilityCache.set(cacheKey, {
    value: { ...value, cached: false },
    expiresAt: Date.now() + POSITIVE_SERVICEABILITY_CACHE_TTL_MS,
  });
}

export function resolveDelhiveryExecution(operation: string) {
  const config = getDelhiveryConfig();
  if (config.validationErrors.length > 0) {
    throw new DelhiveryConfigurationError(config.validationErrors[0]);
  }
  if (config.mode === "mock" && config.allowMock) {
    return { mode: "mock" as const, config };
  }
  if ((config.mode === "live" || config.mode === "sandbox") && config.isConfigured) {
    return { mode: config.mode, config };
  }
  if (config.mode === "disabled") {
    throw new DelhiveryDisabledError(
      `Delhivery ${operation} is unavailable: Delhivery is disabled or DELHIVERY_TOKEN is not configured on the server.`
    );
  }
  throw new DelhiveryConfigurationError(
    `Delhivery ${operation} is unavailable: DELHIVERY_TOKEN is not configured on the server.`
  );
}

export interface PincodeServiceabilityResult {
  pincode: string;
  serviceable: boolean;
  prepaid: boolean;
  cod: boolean;
  city?: string;
  state?: string;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
  verified?: boolean;
  cached?: boolean;
}

export interface CodEligibilityCheckResult {
  eligible: boolean;
  code?: "INVALID_PINCODE" | "DELHIVERY_UNAVAILABLE" | "DELHIVERY_TIMEOUT" | "COD_NOT_SERVICEABLE";
  reason?: string;
  result?: PincodeServiceabilityResult;
}

export interface PincodeServiceabilityOptions {
  timeoutMs?: number;
  skipCache?: boolean;
}

export interface ShipmentBookingResult {
  orderId: string;
  awb: string;
  trackingUrl: string;
  courier: string;
  bookingMode: "delhivery";
  alreadyBooked?: boolean;
  recoveredFromUncertain?: boolean;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
}

export interface ShipmentBookingOptions {
  actorUserId?: string;
  actorRole?: string;
  timeoutMs?: number;
  adminDb?: any;
  fetchFn?: typeof fetch;
  shippingMode?: "Surface" | "Express";
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  pickupLocation?: string;
}

export const DEFAULT_BOOK_WEIGHT_GRAMS = 400;
export const DEFAULT_PARCEL_LENGTH_CM = 22;
export const DEFAULT_PARCEL_WIDTH_CM = 15;
export const DEFAULT_PARCEL_HEIGHT_CM = 4;

const SYNTHETIC_AWB_REGEX = /^(DLH-|REV-|MOCK|FAKE|TEST)/i;

export function normalizeIndianPhoneNumber(rawPhone: unknown): string | null {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  let normalized = digits;
  if (normalized.length === 12 && normalized.startsWith("91")) {
    normalized = normalized.slice(2);
  } else if (normalized.length === 11 && normalized.startsWith("0")) {
    normalized = normalized.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function validateDelhiveryBookingPayload(
  order: any,
  items: any[],
  config: { pickupLocation?: string | null },
  options: ShipmentBookingOptions = {}
): {
  valid: boolean;
  error?: string;
  consignmentData?: Record<string, any>;
} {
  const pickupLocation = String(
    options.pickupLocation ||
      config.pickupLocation ||
      process.env.DELHIVERY_PICKUP_LOCATION ||
      "Primary Warehouse"
  ).trim();
  if (!pickupLocation) {
    return { valid: false, error: "Delhivery pickup warehouse location is not configured." };
  }

  const address: any = order?.address_snapshot || {};
  const customerName = String(address.full_name || "").trim();
  if (!customerName) {
    return { valid: false, error: "Order address is missing recipient full name." };
  }

  const streetAddress = [address.house_no, address.area]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(", ");
  if (!streetAddress) {
    return { valid: false, error: "Order address is missing street / house details." };
  }

  const city = String(address.city || "").trim();
  const state = String(address.state || "").trim();
  if (!city || !state) {
    return { valid: false, error: "Order address must include both city and state." };
  }

  const pincode = String(address.pincode || "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return {
      valid: false,
      error: `Order destination pincode "${pincode || "empty"}" is not a valid 6-digit Indian pincode.`,
    };
  }

  const phone = normalizeIndianPhoneNumber(address.phone);
  if (!phone) {
    return {
      valid: false,
      error: "Order address is missing a valid 10-digit Indian mobile number.",
    };
  }

  const totalAmount = Number(order?.total_amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return {
      valid: false,
      error: `Order total_amount (${order?.total_amount}) must be a positive number for courier booking.`,
    };
  }

  const paymentMethod = String(order?.payment_method || "").toUpperCase();
  if (paymentMethod !== "COD" && paymentMethod !== "ONLINE") {
    return {
      valid: false,
      error: `Unsupported order payment method "${order?.payment_method}" for courier booking.`,
    };
  }

  const paymentMode = paymentMethod === "COD" ? "COD" : "Prepaid";
  const codAmount = paymentMethod === "COD" ? Number(totalAmount.toFixed(2)) : 0;

  let totalQty = 0;
  let computedWeightGrams = 0;
  const titleParts: string[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const qty = Number(item?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { valid: false, error: "Order contains an item with invalid quantity." };
    }
    totalQty += qty;
    const itemWeight = Number(item?.books?.weight_grams || item?.weight_grams || DEFAULT_BOOK_WEIGHT_GRAMS);
    computedWeightGrams += qty * (Number.isFinite(itemWeight) && itemWeight > 0 ? itemWeight : DEFAULT_BOOK_WEIGHT_GRAMS);
    const title = String(item?.title || item?.books?.title || "").trim();
    if (title) titleParts.push(`${title}${qty > 1 ? ` x${qty}` : ""}`);
  }

  const finalWeightGrams =
    options.weightGrams !== undefined ? Number(options.weightGrams) : Math.max(100, computedWeightGrams || DEFAULT_BOOK_WEIGHT_GRAMS);
  if (!Number.isFinite(finalWeightGrams) || finalWeightGrams < 50 || finalWeightGrams > 50000) {
    return { valid: false, error: "Parcel weight must be between 50g and 50,000g." };
  }

  const maxLength = Math.max(
    DEFAULT_PARCEL_LENGTH_CM,
    ...(items || []).map((i: any) => Number(i?.books?.length_cm || i?.length_cm || 0))
  );
  const maxWidth = Math.max(
    DEFAULT_PARCEL_WIDTH_CM,
    ...(items || []).map((i: any) => Number(i?.books?.width_cm || i?.width_cm || 0))
  );
  const totalHeight = Math.max(
    DEFAULT_PARCEL_HEIGHT_CM,
    ...(items || []).map((i: any) => Number(i?.books?.height_cm || i?.height_cm || 0))
  );

  const lengthCm = options.lengthCm !== undefined ? Number(options.lengthCm) : maxLength;
  const widthCm = options.widthCm !== undefined ? Number(options.widthCm) : maxWidth;
  const heightCm = options.heightCm !== undefined ? Number(options.heightCm) : totalHeight;

  if (
    !Number.isFinite(lengthCm) || lengthCm <= 0 ||
    !Number.isFinite(widthCm) || widthCm <= 0 ||
    !Number.isFinite(heightCm) || heightCm <= 0
  ) {
    return { valid: false, error: "Parcel dimensions (length, width, height) must be positive." };
  }

  const productsDesc = (titleParts.length > 0 ? titleParts.join(", ") : "Islamic Books").slice(0, 200);
  const shippingMode = options.shippingMode === "Express" ? "Express" : "Surface";

  const consignmentData = {
    shipments: [
      {
        name: customerName,
        add: streetAddress,
        pin: pincode,
        city,
        state,
        country: "India",
        phone,
        order: String(order.order_number || order.id),
        order_id: order.id,
        payment_mode: paymentMode,
        total_amount: Number(totalAmount.toFixed(2)),
        cod_amount: codAmount,
        products_desc: productsDesc,
        quantity: String(Math.max(1, totalQty)),
        hsn_code: "4901",
        weight: String(Math.round(finalWeightGrams)),
        shipment_length: lengthCm,
        shipment_width: widthCm,
        shipment_height: heightCm,
        shipping_mode: shippingMode,
        address_type: String(address.address_type || "").toLowerCase() === "office" ? "office" : "home",
      },
    ],
    pickup_location: {
      name: pickupLocation,
    },
  };

  return { valid: true, consignmentData };
}

export interface CancelDelhiveryShipmentResult {
  success: boolean;
  awb: string;
  providerResponse?: any;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
  timedOut?: boolean;
  error?: string;
}

export interface CancelDelhiveryShipmentOptions {
  reason?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Validates and checks serviceability for an Indian pincode.
 * Enforces bounded network timeouts, strict JSON validation, and fail-closed parsing.
 * Only positive verified responses in live/sandbox mode are briefly cached (never errors or unserviceable results).
 */
export async function checkPincodeServiceability(
  pincode: string,
  options: PincodeServiceabilityOptions = {}
): Promise<PincodeServiceabilityResult> {
  const cleanPincode = String(pincode || "").trim();

  // Validate standard 6-digit Indian postal code
  if (!/^\d{6}$/.test(cleanPincode)) {
    throw new Error("Invalid pincode format. Must be exactly 6 digits.");
  }

  const { mode, config } = resolveDelhiveryExecution("pincode serviceability");

  // Explicit non-production mock responses for development/test suites
  if (mode === "mock") {
    logger.info("[MOCK][Delhivery] Simulated pincode serviceability check (no external API call)", {
      pincode: cleanPincode,
      mode: "mock",
    });
    if (cleanPincode.endsWith("000") || cleanPincode === "999999") {
      return {
        pincode: cleanPincode,
        serviceable: false,
        prepaid: false,
        cod: false,
        mode: "mock",
        isMock: true,
        verified: true,
      };
    }
    if (cleanPincode === "110001") {
      return {
        pincode: cleanPincode,
        serviceable: true,
        prepaid: true,
        cod: false,
        city: "New Delhi",
        state: "Delhi",
        mode: "mock",
        isMock: true,
        verified: true,
      };
    }
    return {
      pincode: cleanPincode,
      serviceable: true,
      prepaid: true,
      cod: true,
      city: "Delhi",
      state: "Delhi",
      mode: "mock",
      isMock: true,
      verified: true,
    };
  }

  const cacheKey = `${mode}:${config.apiUrl}:${cleanPincode}`;
  if (!options.skipCache) {
    const cached = getPositiveCachedServiceability(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 15000)
      : DEFAULT_DELHIVERY_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${config.apiUrl}/c/api/pin-codes/json/?filter_codes=${cleanPincode}`,
      {
        headers: {
          Authorization: `Token ${config.token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      throw new Error(`Delhivery serviceability check failed: HTTP ${res.status}`);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error("Delhivery serviceability check returned malformed JSON.");
    }

    if (!data || typeof data !== "object" || !Array.isArray(data.delivery_codes)) {
      throw new Error("Delhivery serviceability response missing expected delivery_codes payload.");
    }

    const firstEntry = data.delivery_codes[0];
    const pinData = firstEntry?.postal_code;

    if (!pinData || typeof pinData !== "object") {
      return {
        pincode: cleanPincode,
        serviceable: false,
        prepaid: false,
        cod: false,
        mode,
        verified: true,
      };
    }

    const prepaidFlag = pinData.pre_paid === "Y" || pinData.pre_paid === true;
    const codFlag = pinData.cod === "Y" || pinData.cod === true;
    const explicitlyServiceable = pinData.is_serviceable === true || pinData.is_serviceable === "Y";
    const explicitlyUnserviceable = pinData.is_serviceable === false || pinData.is_serviceable === "N";
    const remarksBlocked = typeof pinData.remarks === "string" && /\bembargo\b/i.test(pinData.remarks);

    const serviceable =
      !explicitlyUnserviceable && !remarksBlocked && (explicitlyServiceable || prepaidFlag || codFlag);

    const result: PincodeServiceabilityResult = {
      pincode: cleanPincode,
      serviceable,
      prepaid: serviceable && prepaidFlag,
      cod: serviceable && codFlag,
      city: typeof pinData.city === "string" ? pinData.city : undefined,
      state: typeof pinData.state_code === "string" ? pinData.state_code : undefined,
      mode,
      verified: true,
      cached: false,
    };

    if (result.serviceable) {
      setPositiveCachedServiceability(cacheKey, result);
    }

    return result;
  } catch (error: any) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      const timeoutErr = new DelhiveryServiceabilityTimeoutError(timeoutMs);
      console.error("Delhivery pincode lookup timeout:", timeoutErr.message);
      throw timeoutErr;
    }
    console.error("Delhivery pincode lookup error:", error?.message || error);
    throw error instanceof Error
      ? error
      : new Error("Delhivery pincode serviceability lookup failed.");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Strictly verifies Cash on Delivery eligibility for checkout (fail-closed).
 * Rejects COD on disabled/unconfigured service, timeouts, upstream failures, malformed responses,
 * unserviceable pincodes, or prepaid-only pincodes.
 */
export async function verifyCodServiceabilityStrict(
  pincode: string,
  options: PincodeServiceabilityOptions = {}
): Promise<CodEligibilityCheckResult> {
  const cleanPincode = String(pincode || "").trim();
  if (!/^\d{6}$/.test(cleanPincode)) {
    return {
      eligible: false,
      code: "INVALID_PINCODE",
      reason: "Delivery address does not contain a valid 6-digit Indian pincode.",
    };
  }

  try {
    const result = await checkPincodeServiceability(cleanPincode, options);
    if (!result.verified || result.serviceable !== true || result.cod !== true) {
      return {
        eligible: false,
        code: "COD_NOT_SERVICEABLE",
        reason: `Cash on Delivery is not available for pincode ${cleanPincode}. Please choose Online Payment or another address.`,
        result,
      };
    }

    return {
      eligible: true,
      result,
    };
  } catch (err: any) {
    if (err instanceof DelhiveryServiceabilityTimeoutError) {
      return {
        eligible: false,
        code: "DELHIVERY_TIMEOUT",
        reason: `Cash on Delivery is temporarily unavailable because courier serviceability verification for pincode ${cleanPincode} timed out. Please retry or choose Online Payment.`,
      };
    }
    return {
      eligible: false,
      code: "DELHIVERY_UNAVAILABLE",
      reason: `Cash on Delivery cannot be placed right now because courier serviceability for pincode ${cleanPincode} could not be verified. Please retry in a moment or choose Online Payment.`,
    };
  }
}

/**
 * Idempotently books a Delhivery consignment shipment for an eligible confirmed/paid order.
 * Acquires a conditional DB lock (`shipping_booking_status = 'booking_in_progress'`) before
 * calling Delhivery so double-clicks or concurrent retries never create duplicate parcels.
 * Timeouts are marked `booking_uncertain` without auto-retrying or advancing the order to Shipped.
 */
export async function createShipmentForOrder(
  orderId: string,
  options: ShipmentBookingOptions = {}
): Promise<ShipmentBookingResult> {
  const { mode, config } = resolveDelhiveryExecution("shipment creation");
  const adminDb = options.adminDb || createAdminClient();
  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 20000)
      : DEFAULT_DELHIVERY_MUTATION_TIMEOUT_MS;

  // 1. Fetch order details and line items for booking payload validation
  const { data: order, error } = await adminDb
    .from("orders")
    .select(
      "id, order_number, order_status, payment_status, payment_method, shipping_courier, shipping_awb, shipping_tracking_url, shipping_booking_mode, shipping_booking_status, address_snapshot, total_amount"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Idempotency / Conflict Checks
  if (order.shipping_booking_mode === "manual") {
    throw new Error(
      `Order already uses a manual shipment (${order.shipping_courier || "Custom Courier"}). Cannot overwrite with a Delhivery API booking.`
    );
  }

  if (order.shipping_awb && isDelhiveryShipment(order)) {
    return {
      orderId: order.id,
      awb: order.shipping_awb,
      trackingUrl:
        resolveOrderTrackingUrl({
          courier: "Delhivery",
          awb: order.shipping_awb,
          trackingUrl: order.shipping_tracking_url,
          bookingMode: "delhivery",
        }) || `https://track.delhivery.com/p/${order.shipping_awb}`,
      courier: "Delhivery",
      bookingMode: "delhivery",
      alreadyBooked: true,
    };
  }

  if (order.shipping_booking_status === "booking_in_progress") {
    throw new Error(
      "A Delhivery shipment booking is already in progress for this order. Please wait and refresh before retrying."
    );
  }

  if (order.shipping_booking_status === "booking_uncertain") {
    throw new Error(
      "Previous Delhivery booking timed out in an uncertain state. Run uncertain booking verification or verify in Delhivery One panel to avoid creating a duplicate AWB before retrying."
    );
  }

  // 3. Validate strict order status & payment eligibility
  const bookableStatuses = ["Confirmed", "Processing", "Packed"];
  if (!bookableStatuses.includes(order.order_status)) {
    throw new Error(
      `Order cannot be booked with Delhivery in "${order.order_status}" status. Allowed: Confirmed, Processing, Packed.`
    );
  }

  if (
    String(order.payment_method || "").toUpperCase() === "ONLINE" &&
    order.payment_status !== "Paid"
  ) {
    throw new Error(
      `Online prepaid order must be Paid before booking Delhivery shipment (current payment status: ${order.payment_status}).`
    );
  }

  // Validate complete Delhivery consignment payload BEFORE acquiring booking lock
  let orderItems: any[] = [];
  try {
    const { data: rawItems } = await adminDb
      .from("order_items")
      .select("id, title, quantity, book_id, books(title, weight_grams, length_cm, width_cm, height_cm)")
      .eq("order_id", order.id);
    if (Array.isArray(rawItems)) {
      orderItems = rawItems;
    }
  } catch {
    orderItems = [];
  }

  const payloadValidation = validateDelhiveryBookingPayload(order, orderItems, config, options);
  if (!payloadValidation.valid || !payloadValidation.consignmentData) {
    throw new Error(payloadValidation.error || "Invalid shipment booking payload.");
  }

  // 4. Acquire optimistic concurrency lock before making external Delhivery API call
  const lockAttemptAt = new Date().toISOString();
  const { data: lockedRow, error: lockErr } = await adminDb
    .from("orders")
    .update({
      shipping_booking_status: "booking_in_progress",
      shipping_last_error: null,
      updated_at: lockAttemptAt,
    })
    .eq("id", order.id)
    .is("shipping_awb", null)
    .in("shipping_booking_status", ["unbooked", "booking_failed"])
    .select("id")
    .maybeSingle();

  if (lockErr || !lockedRow) {
    throw new Error(
      "Unable to acquire Delhivery booking lock for this order (another booking may be in progress)."
    );
  }

  const recordShipmentEvent = async (event: {
    shipmentId?: string | null;
    eventType: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    awb?: string | null;
    note: string;
    metadata?: Record<string, any>;
  }) => {
    try {
      await adminDb.from("shipment_events").insert({
        shipment_id: event.shipmentId || null,
        order_id: order.id,
        event_type: event.eventType,
        source: "delhivery_api",
        previous_status: event.previousStatus || order.order_status,
        new_status: event.newStatus || null,
        actor_id: options.actorUserId || null,
        actor_role: options.actorRole || null,
        carrier_name: "Delhivery",
        awb: event.awb || null,
        note: event.note,
        metadata: event.metadata || {},
      });
    } catch {
      // Non-blocking in offline mock tables without shipment_events
    }
  };

  await recordShipmentEvent({
    eventType: "booking_started",
    newStatus: "booking_in_progress",
    note: `Started Delhivery shipment booking (${mode} mode)`,
    metadata: { mode, consignmentData: payloadValidation.consignmentData },
  });

  let awb: string;
  let trackingUrl: string;
  let rawProviderResponse: Record<string, any> = {};
  const consignmentData = payloadValidation.consignmentData;

  if (mode === "mock") {
    // Deterministic mock AWB strictly for explicit non-production development/test
    awb = `DLV${order.id.replace(/-/g, "").slice(0, 11).toUpperCase()}`;
    trackingUrl = `https://track.delhivery.com/p/${awb}`;
    rawProviderResponse = { mock: true, waybill: awb };
    logger.info("[MOCK][Delhivery] Simulated consignment booking (no external API call)", {
      orderId: order.id,
      awb,
      mode: "mock",
    });
  } else {
    const formBody = new URLSearchParams();
    formBody.append("format", "json");
    formBody.append("data", JSON.stringify(consignmentData));

    try {
      const res = await fetchDelhiveryWithTimeout(
        `${config.apiUrl}/api/cmu/create.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${config.token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formBody.toString(),
        },
        {
          timeoutMs,
          operation: "shipment booking",
          fetchFn: options.fetchFn,
        }
      );

      if (!res.ok) {
        throw new Error(`Delhivery shipment booking failed: HTTP ${res.status}`);
      }

      const resData = await res.json();
      rawProviderResponse = resData && typeof resData === "object" ? resData : { raw: resData };
      const pkg = Array.isArray(resData?.packages) ? resData.packages[0] : null;
      const pkgStatus = String(pkg?.status || "").trim();

      if (
        resData?.success === false ||
        !pkg ||
        pkgStatus.toLowerCase() === "fail" ||
        pkgStatus.toLowerCase() === "error" ||
        (pkgStatus && pkgStatus.toLowerCase() !== "success")
      ) {
        const providerErr =
          pkg?.remarks?.join?.(", ") ||
          pkg?.remarks ||
          resData?.rmk ||
          resData?.error ||
          "Delhivery rejected consignment booking.";
        throw new Error(`Delhivery rejected shipment booking: ${providerErr}`);
      }

      const rawAwb = pkg?.waybill || pkg?.upload_wbn;
      if (!rawAwb || typeof rawAwb !== "string" || !rawAwb.trim() || SYNTHETIC_AWB_REGEX.test(rawAwb.trim())) {
        throw new Error(`Delhivery booking response missing valid waybill: ${JSON.stringify(resData)}`);
      }
      awb = rawAwb.trim();
      trackingUrl = `https://track.delhivery.com/p/${encodeURIComponent(awb)}`;
    } catch (bookingErr: any) {
      const isTimeout = bookingErr instanceof DelhiveryRequestTimeoutError;
      const failStatus = isTimeout ? "booking_uncertain" : "booking_failed";
      const errMsg = bookingErr?.message || "Delhivery shipment booking failed.";

      await adminDb
        .from("orders")
        .update({
          shipping_booking_status: failStatus,
          shipping_last_error: errMsg,
          shipping_provider_response: rawProviderResponse,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      await recordShipmentEvent({
        eventType: failStatus,
        newStatus: failStatus,
        note: errMsg,
        metadata: { timeout: isTimeout, providerResponse: rawProviderResponse },
      });

      throw bookingErr instanceof Error ? bookingErr : new Error(errMsg);
    }
  }

  const now = new Date().toISOString();

  // 5. Update order with tracking information atomically upon confirmed AWB
  // Note: shipping_pickup_scheduled remains FALSE until scheduleDelhiveryPickup actually confirms pickup.
  const { error: updateOrderErr } = await adminDb
    .from("orders")
    .update({
      shipping_awb: awb,
      shipping_tracking_url: trackingUrl,
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_booking_status: "booked",
      shipping_last_error: null,
      shipping_provider_response: rawProviderResponse,
      shipping_shipped_at: now,
      shipping_pickup_scheduled: false,
      order_status: "Shipped",
      updated_at: now,
    })
    .eq("id", order.id);

  if (updateOrderErr) {
    throw new Error(`Booked Delhivery AWB ${awb}, but failed to update order: ${updateOrderErr.message}`);
  }

  let createdShipmentId: string | null = null;
  try {
    const { data: insertedShipment } = await adminDb
      .from("shipments")
      .insert({
        order_id: order.id,
        booking_mode: "delhivery",
        status: "dispatched",
        carrier_name: "Delhivery",
        awb,
        tracking_url: trackingUrl,
        provider_payload: consignmentData,
        provider_response: rawProviderResponse,
        booked_by: options.actorUserId || null,
        booked_at: now,
        shipped_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();
    createdShipmentId = insertedShipment?.id || null;
  } catch {
    // Non-blocking if running against legacy mock store
  }

  await recordShipmentEvent({
    shipmentId: createdShipmentId,
    eventType: "delhivery_booked",
    newStatus: "Shipped",
    awb,
    note: `Booked Delhivery consignment with AWB ${awb}`,
    metadata: { mode, trackingUrl, consignmentData },
  });

  // Feature 1.22: Dispatch shipment notification
  sendShipmentNotification(order.id, "shipped").catch((err) =>
    console.error("Async shipment notification dispatch error:", err)
  );

  return {
    orderId: order.id,
    awb,
    trackingUrl,
    courier: "Delhivery",
    bookingMode: "delhivery",
    alreadyBooked: false,
    mode,
    isMock: mode === "mock",
  };
}

/**
 * Safely verifies an ambiguous `booking_uncertain` Delhivery order by querying Delhivery by reference ID
 * before permitting any retry, preventing duplicate AWB generation after network timeouts.
 */
export async function reconcileUncertainDelhiveryBooking(
  orderId: string,
  options: {
    actorUserId?: string;
    actorRole?: string;
    timeoutMs?: number;
    adminDb?: any;
    fetchFn?: typeof fetch;
  } = {}
): Promise<{
  success: boolean;
  recovered?: boolean;
  clearedToRetry?: boolean;
  awb?: string;
  bookingStatus: string;
  error?: string;
}> {
  const { mode, config } = resolveDelhiveryExecution("uncertain booking verification");
  const adminDb = options.adminDb || createAdminClient();
  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 20000)
      : DEFAULT_DELHIVERY_TIMEOUT_MS;

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_number, order_status, shipping_awb, shipping_booking_status, shipping_booking_mode")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, bookingStatus: "unknown", error: `Order not found: ${orderId}` };
  }

  if (order.shipping_booking_status !== "booking_uncertain") {
    return {
      success: false,
      bookingStatus: order.shipping_booking_status,
      error: `Order is not in booking_uncertain state (current: ${order.shipping_booking_status}).`,
    };
  }

  if (mode === "mock") {
    return {
      success: false,
      bookingStatus: "booking_uncertain",
      error: "Uncertain booking verification cannot query provider in mock mode.",
    };
  }

  const refId = String(order.order_number || order.id).trim();
  const now = new Date().toISOString();

  try {
    const res = await fetchDelhiveryWithTimeout(
      `${config.apiUrl}/api/v1/packages/json/?ref_ids=${encodeURIComponent(refId)}`,
      {
        headers: {
          Authorization: `Token ${config.token}`,
          Accept: "application/json",
        },
      },
      {
        timeoutMs,
        operation: "uncertain booking verification",
        fetchFn: options.fetchFn,
      }
    );

    if (!res.ok) {
      return {
        success: false,
        bookingStatus: "booking_uncertain",
        error: `Delhivery lookup failed with HTTP ${res.status}; booking state remains booking_uncertain.`,
      };
    }

    const resData = await res.json();
    const shipment = resData?.ShipmentData?.[0]?.Shipment || resData?.packages?.[0] || null;
    const foundAwb = String(shipment?.AWB || shipment?.waybill || shipment?.upload_wbn || "").trim();

    if (foundAwb && !SYNTHETIC_AWB_REGEX.test(foundAwb)) {
      const trackingUrl = `https://track.delhivery.com/p/${encodeURIComponent(foundAwb)}`;
      const { error: updErr } = await adminDb
        .from("orders")
        .update({
          shipping_awb: foundAwb,
          shipping_tracking_url: trackingUrl,
          shipping_courier: "Delhivery",
          shipping_booking_mode: "delhivery",
          shipping_booking_status: "booked",
          shipping_last_error: null,
          shipping_provider_response: resData,
          shipping_shipped_at: now,
          shipping_pickup_scheduled: false,
          order_status: ["Confirmed", "Processing", "Packed"].includes(order.order_status)
            ? "Shipped"
            : order.order_status,
          updated_at: now,
        })
        .eq("id", order.id)
        .eq("shipping_booking_status", "booking_uncertain");

      if (updErr) {
        return {
          success: false,
          bookingStatus: "booking_uncertain",
          error: `Verified AWB ${foundAwb} on Delhivery, but DB update failed: ${updErr.message}`,
        };
      }

      try {
        await adminDb.from("shipments").insert({
          order_id: order.id,
          booking_mode: "delhivery",
          status: "dispatched",
          carrier_name: "Delhivery",
          awb: foundAwb,
          tracking_url: trackingUrl,
          provider_response: resData,
          booked_by: options.actorUserId || null,
          booked_at: now,
          shipped_at: now,
        });
        await adminDb.from("shipment_events").insert({
          order_id: order.id,
          event_type: "uncertain_booking_recovered",
          source: "delhivery_api",
          previous_status: order.order_status,
          new_status: "Shipped",
          actor_id: options.actorUserId || null,
          actor_role: options.actorRole || null,
          carrier_name: "Delhivery",
          awb: foundAwb,
          note: `Recovered existing Delhivery consignment AWB ${foundAwb} after timeout check (avoided duplicate manifest).`,
          metadata: { resData },
        });
      } catch {
        // Non-blocking for minimal mock DBs
      }

      return {
        success: true,
        recovered: true,
        awb: foundAwb,
        bookingStatus: "booked",
      };
    }

    // Confirmed empty response -> no parcel exists at Delhivery for refId; safe to unlock for retry
    const noShipmentFound =
      Array.isArray(resData?.ShipmentData) &&
      resData.ShipmentData.length === 0 &&
      (!Array.isArray(resData?.packages) || resData.packages.length === 0);

    if (noShipmentFound || resData?.Error?.includes?.("No such waybill") || resData?.rmk?.includes?.("No data")) {
      await adminDb
        .from("orders")
        .update({
          shipping_booking_status: "booking_failed",
          shipping_last_error: "Verified with Delhivery: no consignment was created before timeout. Safe to retry.",
          shipping_provider_response: resData,
          updated_at: now,
        })
        .eq("id", order.id)
        .eq("shipping_booking_status", "booking_uncertain");

      try {
        await adminDb.from("shipment_events").insert({
          order_id: order.id,
          event_type: "uncertain_booking_cleared",
          source: "delhivery_api",
          previous_status: "booking_uncertain",
          new_status: "booking_failed",
          actor_id: options.actorUserId || null,
          actor_role: options.actorRole || null,
          carrier_name: "Delhivery",
          note: "Verified with Delhivery: no shipment created for reference ID; unlocked for retry.",
          metadata: { resData },
        });
      } catch {
        // Non-blocking
      }

      return {
        success: true,
        recovered: false,
        clearedToRetry: true,
        bookingStatus: "booking_failed",
      };
    }

    return {
      success: false,
      bookingStatus: "booking_uncertain",
      error: "Delhivery verification returned an ambiguous response; state remains booking_uncertain.",
    };
  } catch (err: any) {
    return {
      success: false,
      bookingStatus: "booking_uncertain",
      error: err?.message || "Failed to verify uncertain booking with Delhivery.",
    };
  }
}

/**
 * Cancels a booked Delhivery parcel BEFORE transitioning a Shipped/Out-for-Delivery order to Cancelled.
 * Never mutates order status directly; fails closed on missing config, timeout, or API rejection.
 */
export async function cancelDelhiveryShipment(
  awb: string,
  options: CancelDelhiveryShipmentOptions = {}
): Promise<CancelDelhiveryShipmentResult> {
  const cleanAwb = String(awb || "").trim();
  if (!cleanAwb) {
    return {
      success: false,
      awb: "",
      error: "A valid Delhivery AWB tracking number is required to cancel the courier shipment.",
    };
  }

  let execution: ReturnType<typeof resolveDelhiveryExecution>;
  try {
    execution = resolveDelhiveryExecution("shipment cancellation");
  } catch (err: any) {
    return {
      success: false,
      awb: cleanAwb,
      error: err?.message || "Delhivery shipment cancellation is unavailable: not configured.",
    };
  }

  const { mode, config } = execution;
  if (mode === "mock") {
    logger.info("[MOCK][Delhivery] Simulated consignment cancellation confirmed (no external API call)", {
      awb: cleanAwb,
      reason: options.reason || "admin_cancel",
      mode: "mock",
    });
    return {
      success: true,
      awb: cleanAwb,
      providerResponse: { mock: true, status: true, waybill: cleanAwb, cancellation: true },
      mode: "mock",
      isMock: true,
    };
  }

  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 20000)
      : DEFAULT_DELHIVERY_MUTATION_TIMEOUT_MS;

  try {
    const res = await fetchDelhiveryWithTimeout(
      `${config.apiUrl}/api/p/edit`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${config.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          waybill: cleanAwb,
          cancellation: "true",
        }),
      },
      {
        timeoutMs,
        operation: "shipment cancellation",
        fetchFn: options.fetchFn,
      }
    );

    if (!res.ok) {
      return {
        success: false,
        awb: cleanAwb,
        error: `Delhivery cancellation API rejected request: HTTP ${res.status}`,
      };
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      return {
        success: false,
        awb: cleanAwb,
        error: "Delhivery cancellation API returned malformed JSON response.",
      };
    }

    const cancelledOk =
      data?.status === true || data?.Status === true || data?.success === true;

    if (!cancelledOk) {
      const reasonMsg =
        data?.error ||
        data?.message ||
        data?.rmk ||
        "Delhivery declined shipment cancellation.";
      return {
        success: false,
        awb: cleanAwb,
        providerResponse: data,
        error: `Delhivery shipment cancellation not confirmed: ${reasonMsg}`,
      };
    }

    return {
      success: true,
      awb: cleanAwb,
      providerResponse: data,
      mode,
      isMock: false,
    };
  } catch (err: any) {
    const timedOut = err instanceof DelhiveryRequestTimeoutError;
    return {
      success: false,
      awb: cleanAwb,
      timedOut,
      error:
        err?.message ||
        "Failed to confirm shipment cancellation with Delhivery.",
    };
  }
}

export interface NormalizedTrackingScan {
  timestamp: string;
  location: string;
  status: string;
  statusCode?: string;
}

export interface NormalizedTrackingResult {
  awb: string;
  status: string;
  statusCode: string;
  courier: string;
  origin?: string;
  destination?: string;
  lastUpdated: string;
  scans: NormalizedTrackingScan[];
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
}

const TRACKING_CACHE_TTL_MS = 60 * 1000; // 60 seconds short-lived normalized scan cache
const MAX_TRACKING_CACHE_ENTRIES = 500;
const normalizedTrackingCache = new Map<
  string,
  { value: NormalizedTrackingResult; expiresAt: number }
>();

export function clearTrackingCache(): void {
  normalizedTrackingCache.clear();
}

export interface TrackShipmentOptions {
  skipCache?: boolean;
  timeoutMs?: number;
}

/**
 * Tracks a shipment by its AWB number and normalizes tracking events (Feature 1.14).
 */
export async function trackShipment(
  awb: string,
  options: TrackShipmentOptions = {}
): Promise<NormalizedTrackingResult> {
  const cleanAwb = (awb || "").trim();
  if (!cleanAwb) {
    throw new Error("AWB tracking number is required.");
  }

  const { mode, config } = resolveDelhiveryExecution("shipment tracking");

  if (mode === "mock") {
    const adminDb = createAdminClient();

    // Fetch associated order to provide contextual scans in explicit non-production mode
    const { data: order } = await adminDb
      .from("orders")
      .select("order_status, shipping_shipped_at, delivered_at, address_snapshot")
      .eq("shipping_awb", cleanAwb)
      .maybeSingle();

    const address = (order?.address_snapshot as any) || {};
    const destination = address.city ? `${address.city}, ${address.state || ""}` : "Customer Location";
    const shippedAt = order?.shipping_shipped_at || new Date(Date.now() - 3600000 * 24).toISOString();
    const orderStatus = order?.order_status || "Shipped";

    const scans: NormalizedTrackingScan[] = [
      {
        timestamp: shippedAt,
        location: "Delhi Warehouse Hub",
        status: "Consignment manifested and dispatched via Delhivery Express",
        statusCode: "MANIFESTED",
      },
    ];

    if (orderStatus === "Shipped" || orderStatus === "Out for Delivery" || orderStatus === "Delivered") {
      scans.push({
        timestamp: new Date(new Date(shippedAt).getTime() + 3600000 * 8).toISOString(),
        location: "Regional Sorting Facility",
        status: "In Transit — Arrived at distribution centre",
        statusCode: "IT",
      });
    }

    if (orderStatus === "Out for Delivery" || orderStatus === "Delivered") {
      scans.push({
        timestamp: new Date(new Date(shippedAt).getTime() + 3600000 * 18).toISOString(),
        location: destination,
        status: "Out for Delivery — Package assigned to local courier agent",
        statusCode: "UD",
      });
    }

    if (orderStatus === "Delivered") {
      scans.push({
        timestamp: order?.delivered_at || new Date().toISOString(),
        location: destination,
        status: "Delivered — Package handed over to recipient",
        statusCode: "DL",
      });
    }

    logger.info("[MOCK][Delhivery] Returning simulated tracking events (no external API call)", {
      awb: cleanAwb,
      mode: "mock",
    });

    return {
      awb: cleanAwb,
      status: orderStatus,
      statusCode: orderStatus === "Delivered" ? "DL" : orderStatus === "Out for Delivery" ? "UD" : "IT",
      courier: "Delhivery",
      origin: "New Delhi, DL",
      destination,
      lastUpdated: new Date().toISOString(),
      scans: scans.reverse(),
      mode: "mock",
      isMock: true,
    };
  }

  if (!options.skipCache) {
    const cached = normalizedTrackingCache.get(cleanAwb);
    if (cached) {
      if (Date.now() <= cached.expiresAt) {
        return { ...cached.value, scans: [...cached.value.scans] };
      }
      normalizedTrackingCache.delete(cleanAwb);
    }
  }

  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 15000)
      : DEFAULT_DELHIVERY_TIMEOUT_MS;

  const res = await fetchDelhiveryWithTimeout(
    `${config.apiUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(cleanAwb)}`,
    {
      headers: {
        Authorization: `Token ${config.token}`,
        Accept: "application/json",
      },
    },
    { timeoutMs, operation: "shipment tracking" }
  );

  if (!res.ok) {
    throw new Error(`Delhivery tracking request failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const shipment = raw?.ShipmentData?.[0]?.Shipment || raw?.packages?.[0];

  const rawScans = shipment?.Scans || shipment?.scans || [];
  const normalizedScans: NormalizedTrackingScan[] = rawScans.map((s: any) => ({
    timestamp: s?.ScanDetail?.ScanDateTime || s?.timestamp || new Date().toISOString(),
    location: s?.ScanDetail?.ScannedLocation || s?.location || "En Route",
    status: s?.ScanDetail?.Instructions || s?.status || s?.Scan || "Scan update",
    statusCode: s?.ScanDetail?.ScanType || s?.statusCode,
  }));

  const rawStatus = shipment?.Status?.Status || shipment?.status || "In Transit";
  const mappedStatus = mapDelhiveryStatusToOrderStatus(rawStatus) || rawStatus;

  const normalized: NormalizedTrackingResult = {
    awb: cleanAwb,
    status: mappedStatus,
    statusCode: rawStatus,
    courier: "Delhivery",
    origin: shipment?.PickUpLocation || shipment?.origin,
    destination: shipment?.DeliveryLocation || shipment?.destination,
    lastUpdated: new Date().toISOString(),
    scans: normalizedScans,
  };

  if (normalizedTrackingCache.size >= MAX_TRACKING_CACHE_ENTRIES) {
    const oldestKey = normalizedTrackingCache.keys().next().value;
    if (oldestKey) normalizedTrackingCache.delete(oldestKey);
  }
  normalizedTrackingCache.set(cleanAwb, {
    value: normalized,
    expiresAt: Date.now() + TRACKING_CACHE_TTL_MS,
  });

  return normalized;
}

/**
 * Maps Delhivery webhook event codes to internal order status.
 */
export function mapDelhiveryStatusToOrderStatus(
  delhiveryStatus: string,
  statusCode?: string,
  statusType?: string
): string | null {
  const candidates = [delhiveryStatus, statusCode, statusType]
    .map((v) => String(v || "").toUpperCase().trim())
    .filter(Boolean);

  for (const statusUpper of candidates) {
    switch (statusUpper) {
      case "DL":
      case "DELIVERED":
        return "Delivered";
      case "UD":
      case "OUT FOR DELIVERY":
      case "OO":
      case "OFD":
        return "Out for Delivery";
      case "IT":
      case "IN TRANSIT":
      case "IN-TRANSIT":
      case "DISPATCHED":
      case "MANIFESTED":
        return "Shipped";
      case "RT":
      case "RTO":
      case "RETURNED":
      case "RTO DELIVERED":
      case "DTO":
        return "Returned";
      default:
        break;
    }
  }
  return null;
}

export const ORDER_STATUS_PROGRESS_RANK: Record<string, number> = {
  Pending: -1,
  Confirmed: 0,
  Processing: 0,
  Packed: 0,
  Shipped: 1,
  "Out for Delivery": 2,
  Delivered: 3,
  Returned: 3,
};

export function parseDelhiveryWebhookTimestamp(payload: any): {
  timestampIso: string | null;
  malformed: boolean;
} {
  const raw =
    payload?.Shipment?.Status?.StatusDateTime ||
    payload?.StatusDateTime ||
    payload?.ScanDateTime ||
    payload?.status_datetime ||
    payload?.event_timestamp ||
    payload?.timestamp ||
    payload?.Scans?.[0]?.ScanDetail?.ScanDateTime ||
    null;

  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { timestampIso: null, malformed: false };
  }

  const parsed = new Date(String(raw).trim());
  if (Number.isNaN(parsed.getTime())) {
    return { timestampIso: null, malformed: true };
  }

  return { timestampIso: parsed.toISOString(), malformed: false };
}

export function computeDelhiveryWebhookEventId(payload: any): string {
  const explicitId =
    payload?.event_id || payload?.eventId || payload?.webhook_id || payload?.id;
  if (explicitId && String(explicitId).trim()) {
    return `delhivery:${String(explicitId).trim()}`;
  }

  const statusObj = payload?.Shipment?.Status || {};
  const waybill = String(
    payload?.waybill || payload?.awb || payload?.Shipment?.AWB || payload?.Shipment?.waybill || ""
  ).trim();
  const rawStatus = String(payload?.status || statusObj?.Status || payload?.Status || "").trim();
  const statusCode = String(payload?.status_code || payload?.statusCode || statusObj?.StatusCode || "").trim();
  const statusType = String(payload?.status_type || payload?.statusType || statusObj?.StatusType || "").trim();
  const { timestampIso } = parseDelhiveryWebhookTimestamp(payload);
  const location = String(payload?.location || statusObj?.StatusLocation || "").trim();
  const instructions = String(payload?.instructions || statusObj?.Instructions || "").trim();

  const fingerprintInput = JSON.stringify({
    waybill,
    rawStatus,
    statusCode,
    statusType,
    timestampIso,
    location,
    instructions,
  });
  const hash = crypto.createHash("sha256").update(fingerprintInput).digest("hex");
  return `delhivery:hash:${hash}`;
}

/**
 * Validates the authenticity of inbound Delhivery tracking webhooks.
 * Fails closed if DELHIVERY_WEBHOOK_SECRET is missing or empty.
 * Supports:
 * - Authorization: Token <secret>
 * - Authorization: Bearer <secret>
 * - Custom header: x-delhivery-secret or x-delhivery-token
 */
export function verifyDelhiveryWebhookAuth(
  authHeader: string | null,
  customSecretHeader: string | null
): { authorized: boolean; reason?: string } {
  const config = getDelhiveryConfig();
  const webhookSecret = config.webhookSecret;

  if (process.env.ENABLE_DELHIVERY?.trim().toLowerCase() === "false") {
    return {
      authorized: false,
      reason: "Delhivery integration is disabled on server (ENABLE_DELHIVERY=false) (fail closed)",
    };
  }

  if (
    !webhookSecret ||
    isPlaceholderValue(webhookSecret) ||
    (config.isProduction && isMockTokenValue(webhookSecret))
  ) {
    return {
      authorized: false,
      reason: "DELHIVERY_WEBHOOK_SECRET is not configured on server (fail closed)",
    };
  }

  if (config.mode === "disabled" && !config.allowMock) {
    return {
      authorized: false,
      reason: "Delhivery integration is disabled on server (ENABLE_DELHIVERY=false) (fail closed)",
    };
  }

  let candidateToken = "";

  if (customSecretHeader && customSecretHeader.trim()) {
    candidateToken = customSecretHeader.trim();
  } else if (authHeader && authHeader.trim()) {
    const raw = authHeader.trim();
    const parts = raw.split(" ");
    if (parts.length === 2 && (parts[0].toLowerCase() === "token" || parts[0].toLowerCase() === "bearer")) {
      candidateToken = parts[1].trim();
    } else {
      candidateToken = raw;
    }
  }

  if (!candidateToken) {
    return { authorized: false, reason: "Missing authentication token or header" };
  }

  try {
    const candidateBuf = Buffer.from(candidateToken, "utf8");
    const secretBuf = Buffer.from(webhookSecret, "utf8");

    if (candidateBuf.length !== secretBuf.length) {
      return { authorized: false, reason: "Invalid credential length" };
    }

    const isValid = crypto.timingSafeEqual(candidateBuf, secretBuf);
    return { authorized: isValid, reason: isValid ? undefined : "Incorrect secret token" };
  } catch {
    return { authorized: false, reason: "Verification failure" };
  }
}

/**
 * Validates whether transitioning an order from currentStatus to nextStatus is permitted
 * by inbound Delhivery webhook updates. Never cancels or regresses terminal orders.
 */
export function isAllowedStatusTransition(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;

  // Terminal and replacement states cannot be altered by courier tracking webhooks
  if (
    currentStatus === "Cancelled" ||
    currentStatus === "Delivered" ||
    currentStatus === "Returned" ||
    currentStatus.startsWith("Replacement")
  ) {
    return false;
  }

  const forwardTransitions: Record<string, string[]> = {
    Confirmed: ["Shipped", "Returned"],
    Processing: ["Shipped", "Returned"],
    Packed: ["Shipped", "Returned"],
    Shipped: ["Out for Delivery", "Delivered", "Returned"],
    "Out for Delivery": ["Delivered", "Returned"],
  };

  const allowed = forwardTransitions[currentStatus] || [];
  return allowed.includes(nextStatus);
}

/**
 * Processes inbound Delhivery tracking webhooks with strict transition, booking-mode,
 * optimistic concurrency, and shipment-event logging validation.
 */
export async function processDelhiveryWebhook(
  payload: any,
  deps?: { adminDb?: any }
) {
  const statusObj = payload?.Shipment?.Status || {};
  const rawWaybill =
    payload?.waybill || payload?.awb || payload?.Shipment?.AWB || payload?.Shipment?.waybill;
  const waybill = typeof rawWaybill === "string" ? rawWaybill.trim() : String(rawWaybill || "").trim();
  const rawStatus = payload?.status || statusObj?.Status || payload?.Status || "";
  const statusCode = payload?.status_code || payload?.statusCode || statusObj?.StatusCode || "";
  const statusType = payload?.status_type || payload?.statusType || statusObj?.StatusType || "";

  if (!waybill || (!rawStatus && !statusCode && !statusType)) {
    return { status: "ignored", reason: "Missing waybill or status in payload" };
  }

  const internalStatus = mapDelhiveryStatusToOrderStatus(rawStatus, statusCode, statusType);
  if (!internalStatus) {
    return { status: "unmapped_status", rawStatus: rawStatus || statusCode || statusType };
  }

  const eventId = computeDelhiveryWebhookEventId(payload);
  const { timestampIso: eventTimestampIso, malformed: malformedTimestamp } =
    parseDelhiveryWebhookTimestamp(payload);
  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
  const displayRawStatus = String(rawStatus || statusCode || statusType).trim();

  const adminDb = deps?.adminDb || createAdminClient();
  const now = new Date().toISOString();

  const dispatchTrackingNotification = (orderId: string, nextStatus: string) => {
    if (nextStatus === "Shipped") {
      sendShipmentNotification(orderId, "shipped").catch((err) =>
        console.error("Async shipment notification error:", err)
      );
    } else if (nextStatus === "Out for Delivery") {
      sendShipmentNotification(orderId, "out_for_delivery").catch((err) =>
        console.error("Async out for delivery notification error:", err)
      );
    } else if (nextStatus === "Delivered") {
      sendShipmentNotification(orderId, "delivered").catch((err) =>
        console.error("Async delivered notification error:", err)
      );
    }
  };

  // Prefer atomic PostgreSQL transaction when RPC is available
  try {
    const { data: rpcRes, error: rpcErr } = await adminDb.rpc("apply_delhivery_webhook_atomic", {
      p_event_id: eventId,
      p_event_type: displayRawStatus,
      p_waybill: waybill,
      p_raw_status: displayRawStatus,
      p_internal_status: internalStatus,
      p_event_timestamp: eventTimestampIso,
      p_payload_hash: payloadHash,
      p_payload: payload && typeof payload === "object" ? payload : { rawStatus: displayRawStatus },
    });

    const rpcErrMsg = String(rpcErr?.message || "");
    const rpcMissingInEnvOrMock =
      rpcErrMsg.includes("Unhandled RPC") ||
      rpcErrMsg.includes("does not exist") ||
      rpcErrMsg.includes("Could not find the function") ||
      rpcErr?.code === "42883" ||
      rpcErr?.code === "PGRST202";

    if (!rpcErr && rpcRes && typeof rpcRes === "object") {
      const resObj = rpcRes as any;
      if (resObj.status === "updated" && resObj.order_id && resObj.new_status) {
        dispatchTrackingNotification(resObj.order_id, resObj.new_status);
      }
      return {
        status: resObj.status,
        duplicate: Boolean(resObj.duplicate),
        eventId: resObj.event_id || eventId,
        orderId: resObj.order_id,
        newStatus: resObj.new_status,
        currentStatus: resObj.current_status,
        attemptedStatus: resObj.attempted_status,
        statusValue: resObj.status_value,
        waybill: resObj.waybill || waybill,
        reason: resObj.reason,
        courier: resObj.courier,
      };
    }

    if (!rpcMissingInEnvOrMock && rpcErr) {
      throw new Error(`Delhivery webhook RPC failed: ${rpcErr.message}`);
    }
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!msg.includes("Unhandled RPC") && !msg.includes("is not a function")) {
      throw err;
    }
  }

  // Fallback transactional flow for legacy unit mocks without RPC support:
  // 1. Durable event deduplication check in webhook_events
  let hasWebhookEventsTable = true;
  try {
    const { data: existingEvent } = await adminDb
      .from("webhook_events")
      .select("id, status, processing_outcome, order_id, updated_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === "completed" || existingEvent.status === "ignored") {
        return {
          status: "duplicate_ignored",
          duplicate: true,
          eventId,
          orderId: existingEvent.order_id,
          reason: "Webhook event already processed",
        };
      }
      if (existingEvent.status === "processing") {
        const ageMs = Date.now() - new Date(existingEvent.updated_at || now).getTime();
        if (ageMs < 120_000) {
          return {
            status: "in_flight_duplicate",
            duplicate: true,
            eventId,
            reason: "Webhook event is currently being processed",
          };
        }
      }
      await adminDb
        .from("webhook_events")
        .update({ status: "processing", updated_at: now })
        .eq("event_id", eventId);
    } else {
      const { error: insertEvtErr } = await adminDb.from("webhook_events").insert({
        event_id: eventId,
        provider: "Delhivery",
        event_type: displayRawStatus,
        status: "processing",
        payload: payload && typeof payload === "object" ? payload : { rawStatus: displayRawStatus },
        payload_hash: payloadHash,
        provider_event_timestamp: eventTimestampIso,
        waybill,
        created_at: now,
        updated_at: now,
      });
      if (insertEvtErr && String(insertEvtErr.message || "").toLowerCase().includes("duplicate")) {
        return {
          status: "duplicate_ignored",
          duplicate: true,
          eventId,
          reason: "Concurrent duplicate webhook detected",
        };
      }
    }
  } catch {
    hasWebhookEventsTable = false;
  }

  const finalizeWebhookEvent = async (
    statusVal: "completed" | "ignored" | "failed",
    outcome: string,
    orderId?: string | null,
    errMsg?: string
  ) => {
    if (!hasWebhookEventsTable) return;
    try {
      await adminDb
        .from("webhook_events")
        .update({
          status: statusVal,
          processing_outcome: outcome,
          order_id: orderId || null,
          error_message: errMsg || null,
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    } catch {
      // Non-blocking for minimal mock tables
    }
  };

  try {
    const { data: order, error } = await adminDb
      .from("orders")
      .select(
        "id, order_status, shipping_awb, shipping_courier, shipping_booking_mode, payment_method, payment_status, is_paid, cod_collection_status, total_amount, cod_settlement_status, shipping_last_webhook_at"
      )
      .eq("shipping_awb", waybill)
      .single();

    if (error || !order) {
      await finalizeWebhookEvent("ignored", "order_not_found");
      return { status: "order_not_found", waybill, eventId };
    }

    if (
      order.shipping_booking_mode === "manual" ||
      (order.shipping_courier && order.shipping_courier.trim().toLowerCase() !== "delhivery")
    ) {
      await finalizeWebhookEvent("ignored", "ignored_non_delhivery_order", order.id);
      return {
        status: "ignored_non_delhivery_order",
        orderId: order.id,
        courier: order.shipping_courier,
        eventId,
      };
    }

    const logWebhookEvent = async (eventType: string, newStatus: string, note: string) => {
      try {
        await adminDb.from("shipment_events").insert({
          order_id: order.id,
          event_type: eventType,
          source: "delhivery_webhook",
          previous_status: order.order_status,
          new_status: newStatus,
          carrier_name: "Delhivery",
          awb: waybill,
          note,
          metadata: {
            ...(payload && typeof payload === "object" ? payload : { rawStatus: displayRawStatus }),
            event_id: eventId,
            event_timestamp: eventTimestampIso,
            malformed_timestamp: malformedTimestamp,
          },
        });
      } catch {
        // Non-blocking in legacy mock tables
      }
    };

    // Out-of-order timestamp check
    if (eventTimestampIso && order.shipping_last_webhook_at) {
      const incomingMs = new Date(eventTimestampIso).getTime();
      const latestMs = new Date(order.shipping_last_webhook_at).getTime();
      if (!Number.isNaN(incomingMs) && !Number.isNaN(latestMs) && incomingMs < latestMs) {
        await logWebhookEvent(
          "webhook_stale_ignored",
          internalStatus,
          `Ignored out-of-order Delhivery webhook (${eventTimestampIso} < ${order.shipping_last_webhook_at}).`
        );
        await finalizeWebhookEvent("ignored", "stale_timestamp_ignored", order.id);
        return {
          status: "stale_event_ignored",
          reason: "Incoming webhook timestamp predates latest processed event.",
          orderId: order.id,
          currentStatus: order.order_status,
          attemptedStatus: internalStatus,
          eventId,
        };
      }
    }

    // Idempotency check: already in requested status
    if (order.order_status === internalStatus) {
      await finalizeWebhookEvent("completed", "already_current", order.id);
      return { status: "already_current", orderId: order.id, statusValue: internalStatus, eventId };
    }

    // Stale lower-rank regression on non-cancelled orders (e.g. In Transit after Out for Delivery or Delivered)
    const currentRank = ORDER_STATUS_PROGRESS_RANK[order.order_status] ?? -1;
    const incomingRank = ORDER_STATUS_PROGRESS_RANK[internalStatus] ?? -1;
    if (
      order.order_status !== "Cancelled" &&
      !String(order.order_status).startsWith("Replacement") &&
      currentRank >= 1 &&
      incomingRank <= currentRank
    ) {
      await logWebhookEvent(
        "webhook_stale_ignored",
        internalStatus,
        `Ignored stale lower-rank courier event (${internalStatus}) because order is already "${order.order_status}".`
      );
      await finalizeWebhookEvent("ignored", "stale_rank_ignored", order.id);
      return {
        status: "stale_event_ignored",
        reason: "Order already at equal or newer delivery milestone.",
        orderId: order.id,
        currentStatus: order.order_status,
        attemptedStatus: internalStatus,
        eventId,
      };
    }

    // Strict state machine validation (blocks Cancelled / Pending / Replacement jumps)
    const transitionAllowed = isAllowedStatusTransition(order.order_status, internalStatus);
    if (!transitionAllowed) {
      await logWebhookEvent(
        "webhook_rejected_illegal",
        internalStatus,
        `Rejected illegal courier transition from "${order.order_status}" to "${internalStatus}".`
      );
      await finalizeWebhookEvent("ignored", "rejected_illegal_transition", order.id);
      return {
        status: "rejected_illegal_transition",
        orderId: order.id,
        currentStatus: order.order_status,
        attemptedStatus: internalStatus,
        eventId,
      };
    }

    const nextWebhookTimestamp =
      eventTimestampIso &&
      (!order.shipping_last_webhook_at ||
        new Date(eventTimestampIso).getTime() >= new Date(order.shipping_last_webhook_at).getTime())
        ? eventTimestampIso
        : order.shipping_last_webhook_at || null;

    // D-2 Remediation: Prevent courier tracking webhooks from bypassing mandatory merchant OTP verification
    if (internalStatus === "Delivered") {
      const { data: otps } = await adminDb
        .from("delivery_otps")
        .select("id, status, verified_at")
        .eq("order_id", order.id);

      const hasUnverifiedOtp =
        otps &&
        otps.length > 0 &&
        !otps.some((o: any) => o.status === "verified" || o.verified_at !== null);

      if (hasUnverifiedOtp) {
        await adminDb
          .from("orders")
          .update({
            shipping_delivered_at: now,
            shipping_last_webhook_at: nextWebhookTimestamp,
            shipping_last_webhook_status: displayRawStatus,
            updated_at: now,
          })
          .eq("id", order.id);

        await logWebhookEvent(
          "webhook_received",
          order.order_status,
          "Delhivery reported Delivered; awaiting merchant doorstep OTP verification."
        );
        await finalizeWebhookEvent("completed", "otp_verification_required", order.id);

        return {
          status: "otp_verification_required",
          orderId: order.id,
          currentStatus: order.order_status,
          eventId,
          message:
            "Courier marked delivered, but mandatory merchant doorstep OTP verification is required before order completion.",
        };
      }
    }

    const updateData: any = {
      order_status: internalStatus,
      shipping_last_webhook_at: nextWebhookTimestamp,
      shipping_last_webhook_status: displayRawStatus,
      updated_at: now,
    };

    if (internalStatus === "Delivered") {
      updateData.delivered_at = now;
      updateData.shipping_delivered_at = now;
      if (order.payment_method === "COD" && order.payment_status !== "Paid") {
        updateData.cod_settlement_status = "pending";
      }
    } else if (
      internalStatus === "Returned" &&
      String(order.payment_method || "").toUpperCase() === "COD" &&
      !order.is_paid &&
      (order.cod_collection_status || "uncollected") !== "collected" &&
      order.cod_collection_status !== "excess"
    ) {
      updateData.cod_settlement_status = "unsettled";
      updateData.refund_status = "not_required";
    }

    const { data: updatedRow, error: updErr } = await adminDb
      .from("orders")
      .update(updateData)
      .eq("id", order.id)
      .eq("order_status", order.order_status)
      .select("id")
      .maybeSingle();

    if (updErr || !updatedRow) {
      await finalizeWebhookEvent("failed", "rejected_concurrent_update", order.id, updErr?.message);
      return {
        status: "rejected_concurrent_update",
        orderId: order.id,
        currentStatus: order.order_status,
        attemptedStatus: internalStatus,
        eventId,
        error: updErr?.message,
      };
    }

    try {
      await adminDb
        .from("shipments")
        .update({
          status:
            internalStatus === "Out for Delivery"
              ? "out_for_delivery"
              : internalStatus === "Delivered"
              ? "delivered"
              : internalStatus === "Returned"
              ? "returned"
              : "in_transit",
          delivered_at: internalStatus === "Delivered" ? now : undefined,
          last_webhook_event_id: eventId,
          last_webhook_event_at: nextWebhookTimestamp || undefined,
          updated_at: now,
        })
        .eq("order_id", order.id)
        .not("status", "in", '("cancelled","failed")');
    } catch {
      // Non-blocking for mock DBs without shipments
    }

    await logWebhookEvent(
      "webhook_received",
      internalStatus,
      `Delhivery webhook updated status from ${order.order_status} to ${internalStatus} (${displayRawStatus})`
    );
    await finalizeWebhookEvent("completed", "applied", order.id);

    dispatchTrackingNotification(order.id, internalStatus);

    return { status: "updated", orderId: order.id, newStatus: internalStatus, eventId };
  } catch (err: any) {
    await finalizeWebhookEvent("failed", "unexpected_error", null, err?.message || String(err));
    throw err;
  }
}

export interface PickupScheduleParams {
  pickupDate?: string; // YYYY-MM-DD
  pickupTime?: string; // HH:MM:SS
  expectedPackageCount?: number;
  pickupLocation?: string;
}

export interface PickupScheduleResult {
  success: boolean;
  pickupRequestId?: string;
  pickupScheduledAt?: string;
  message?: string;
  error?: string;
}

/**
 * Schedules a Delhivery courier pickup for a booked shipment (Feature 1.11).
 */
export async function scheduleDelhiveryPickup(
  orderId: string,
  params?: PickupScheduleParams
): Promise<PickupScheduleResult> {
  let execution: ReturnType<typeof resolveDelhiveryExecution>;
  try {
    execution = resolveDelhiveryExecution("pickup scheduling");
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Delhivery pickup scheduling is unavailable: not configured.",
    };
  }

  const { mode, config } = execution;
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select(
      "id, order_status, shipping_courier, shipping_booking_mode, shipping_awb, shipping_pickup_request_id, shipping_pickup_scheduled_at, address_snapshot"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: `Order ${orderId} not found.` };
  }

  if (order.shipping_booking_mode === "manual" || (order.shipping_courier && order.shipping_courier.toLowerCase() !== "delhivery")) {
    return {
      success: false,
      error: `Cannot schedule Delhivery pickup for manual/non-Delhivery carrier (${order.shipping_courier || "manual"}).`,
    };
  }

  if (!order.shipping_awb) {
    return { success: false, error: "Cannot schedule pickup: Order has no AWB consignment booked." };
  }

  if (order.shipping_pickup_request_id) {
    return {
      success: true,
      pickupRequestId: order.shipping_pickup_request_id,
      pickupScheduledAt: order.shipping_pickup_scheduled_at || new Date().toISOString(),
      message: "Pickup has already been scheduled for this shipment.",
    };
  }

  const pickupDate = params?.pickupDate || new Date().toISOString().split("T")[0];
  const pickupTime = params?.pickupTime || "14:00:00";
  const nowIso = new Date().toISOString();

  let pickupRequestId: string;

  if (mode === "mock") {
    pickupRequestId = `PKP-${order.shipping_awb.replace(/\D/g, "").slice(0, 8) || "MOCK"}-${Date.now().toString(36).toUpperCase()}`;
    logger.info("[MOCK][Delhivery] Simulated pickup request scheduled (no external API call)", {
      orderId: order.id,
      pickupRequestId,
      mode: "mock",
    });
  } else {
    try {
      const res = await fetchDelhiveryWithTimeout(
        `${config.apiUrl}/fm/request/new/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${config.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pickup_location: params?.pickupLocation || config.pickupLocation || "Primary Warehouse",
            expected_package_count: params?.expectedPackageCount || 1,
            pickup_date: pickupDate,
            pickup_time: pickupTime,
          }),
        },
        { timeoutMs: DEFAULT_DELHIVERY_MUTATION_TIMEOUT_MS, operation: "pickup request" }
      );

      if (!res.ok) {
        throw new Error(`Delhivery pickup request failed: HTTP ${res.status}`);
      }

      const resData = await res.json();
      pickupRequestId = resData?.pr_id || resData?.pickup_id || resData?.request_id;
      if (!pickupRequestId) {
        throw new Error(`No pickup ID returned: ${JSON.stringify(resData)}`);
      }
    } catch (err: any) {
      console.error("Delhivery pickup API error:", err?.message || err);
      return { success: false, error: err?.message || "Failed to communicate with Delhivery pickup API." };
    }
  }

  // Update order record with pickup reference
  await adminDb
    .from("orders")
    .update({
      shipping_pickup_request_id: pickupRequestId,
      shipping_pickup_scheduled: true,
      shipping_pickup_scheduled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  return {
    success: true,
    pickupRequestId,
    pickupScheduledAt: nowIso,
    message: mode === "mock"
      ? "[MOCK] Simulated Delhivery pickup request confirmed (dev/test only)."
      : "Delhivery pickup request confirmed.",
  };
}

/**
 * Retrieves or generates shipping label / packing slip for a booked AWB (Feature 1.13).
 */
export async function getShippingLabel(
  awb: string
): Promise<{ success: boolean; labelUrl?: string; htmlContent?: string; error?: string }> {
  if (!awb || !awb.trim()) {
    return { success: false, error: "AWB tracking number is required." };
  }

  const cleanAwb = awb.trim();
  let execution: ReturnType<typeof resolveDelhiveryExecution>;
  try {
    execution = resolveDelhiveryExecution("shipping label retrieval");
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Delhivery shipping labels are unavailable: not configured.",
    };
  }

  const { mode, config } = execution;

  if (mode === "mock") {
    // Generate printable mock packing slip strictly in explicit non-production mode
    logger.info("[MOCK][Delhivery] Generated simulated dev/test shipping label", {
      awb: cleanAwb,
      mode: "mock",
    });
    return {
      success: true,
      labelUrl: `https://track.delhivery.com/p/${cleanAwb}?label=pdf&mock=true`,
      htmlContent: `
        <div style="font-family: sans-serif; padding: 24px; border: 2px solid #000; max-width: 480px; margin: auto;">
          <div style="background: #fef3c7; color: #92400e; padding: 6px 10px; font-size: 11px; font-weight: bold; margin-bottom: 12px; border: 1px solid #f59e0b;">
            DEV / TEST MOCK LABEL — NOT VALID FOR DISPATCH
          </div>
          <div style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">MD Shakib Islamic Books</h2>
            <p style="margin: 4px 0 0; font-size: 11px;">Authentic Classical Islamic Literature</p>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
            <div>
              <p style="margin: 0; font-size: 10px; color: #555;">COURIER PARTNER</p>
              <h3 style="margin: 2px 0 0; font-size: 16px;">DELHIVERY (MOCK)</h3>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: 10px; color: #555;">WAYBILL / AWB</p>
              <h3 style="margin: 2px 0 0; font-size: 16px; font-family: monospace;">${cleanAwb}</h3>
            </div>
          </div>
          <div style="border-top: 1px dashed #999; padding-top: 12px; margin-top: 12px; font-size: 11px;">
            <p style="margin: 0;">Simulated Development Dispatch Package</p>
          </div>
        </div>
      `,
    };
  }

  try {
    const res = await fetchDelhiveryWithTimeout(
      `${config.apiUrl}/api/p/packing_slip?wbns=${encodeURIComponent(cleanAwb)}&pdf=true`,
      {
        headers: {
          Authorization: `Token ${config.token}`,
          Accept: "application/json",
        },
      },
      { timeoutMs: DEFAULT_DELHIVERY_MUTATION_TIMEOUT_MS, operation: "shipping label" }
    );

    if (!res.ok) {
      throw new Error(`Delhivery label request failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const pkg = data?.packages_found?.[0] || data?.packages?.[0];
    const labelUrl = pkg?.pdf_download_link || pkg?.label_url;

    return {
      success: true,
      labelUrl: labelUrl || `https://track.delhivery.com/p/${cleanAwb}`,
    };
  } catch (err: any) {
    console.error("Delhivery label retrieval error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to retrieve shipping label." };
  }
}

/**
 * Reconciles actual COD remittance from courier settlement information (Feature 1.15).
 */
export async function reconcileDelhiveryCODRemittance(
  params: {
    orderId: string;
    settlementRef: string;
    remittedAmount: number;
    adminUserId: string;
    notes?: string;
  },
  deps?: { adminDb?: any }
): Promise<{ success: boolean; error?: string; status?: string; remittanceId?: string }> {
  const { orderId, settlementRef, remittedAmount, adminUserId, notes } = params;
  const adminDb = deps?.adminDb || createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, total_amount, payment_method, payment_status, order_status, cod_settlement_status")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: `Order ${orderId} not found.` };
  }

  const res = await reconcileCourierRemittance(
    {
      remittanceRef: settlementRef,
      courier: "Delhivery",
      orderId: order.id,
      expectedAmount: Number(order.total_amount),
      remittedAmount,
      adminId: adminUserId,
      notes,
    },
    { adminDb }
  );

  return {
    success: res.success,
    error: res.error,
    status: res.status === "matched" ? "reconciled" : res.status,
    remittanceId: res.remittanceId,
  };
}

