import { roundCurrency } from "@/lib/commerce/pricing";
import { validateIndianGstin } from "@/lib/env/shared";

export { validateIndianGstin };

export interface TaxCalculationParams {
  subtotal: number;
  discount: number;
  shippingFee: number;
  platformFee?: number;
  stateCode?: string;
  pincode?: string;
  sellerStateCode?: string;
  sellerGstin?: string;
}

export interface TaxBreakdown {
  taxableValue: number;
  platformFee: number;
  shippingFee: number;
  sellerStateCode: string;
  placeOfSupplyCode: string;
  isInterstate: boolean;
  booksGstRate: number;
  booksGstAmount: number;
  shippingGstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
}

export const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export function getGstStateName(code?: string | null): string {
  const clean = (code || "").trim();
  return GST_STATE_NAMES[clean] || "Unknown Jurisdiction";
}

/**
 * Normalizes Indian state name, ISO/common abbreviation, 2-digit GST code, or PIN prefix
 * to its official 2-digit Indian GST jurisdiction code.
 */
export function normalizeStateToGstCode(input?: string, pincode?: string): string {
  const s = (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (/^(0[1-9]|[12][0-9]|3[0-8]|97|99)$/.test(s)) return s;

  const stateMap: Record<string, string> = {
    "jammu and kashmir": "01",
    "jammu kashmir": "01",
    jk: "01",
    "j k": "01",
    "himachal pradesh": "02",
    hp: "02",
    punjab: "03",
    pb: "03",
    chandigarh: "04",
    ch: "04",
    uttarakhand: "05",
    uttaranchal: "05",
    uk: "05",
    ua: "05",
    haryana: "06",
    hr: "06",
    delhi: "07",
    dl: "07",
    "new delhi": "07",
    "nct of delhi": "07",
    "delhi ncr": "07",
    rajasthan: "08",
    rj: "08",
    "uttar pradesh": "09",
    uttarpradesh: "09",
    up: "09",
    bihar: "10",
    br: "10",
    sikkim: "11",
    sk: "11",
    "arunachal pradesh": "12",
    ar: "12",
    nagaland: "13",
    nl: "13",
    manipur: "14",
    mn: "14",
    mizoram: "15",
    mz: "15",
    tripura: "16",
    tr: "16",
    meghalaya: "17",
    ml: "17",
    assam: "18",
    as: "18",
    "west bengal": "19",
    bengal: "19",
    wb: "19",
    jharkhand: "20",
    jh: "20",
    odisha: "21",
    orissa: "21",
    od: "21",
    or: "21",
    chhattisgarh: "22",
    chattisgarh: "22",
    cg: "22",
    ct: "22",
    "madhya pradesh": "23",
    mp: "23",
    gujarat: "24",
    gj: "24",
    "daman and diu": "25",
    "daman diu": "25",
    dd: "25",
    "dadra and nagar haveli": "26",
    "dadra and nagar haveli and daman and diu": "26",
    dnhdd: "26",
    dn: "26",
    dnh: "26",
    maharashtra: "27",
    mh: "27",
    karnataka: "29",
    ka: "29",
    goa: "30",
    ga: "30",
    lakshadweep: "31",
    ld: "31",
    kerala: "32",
    kl: "32",
    "tamil nadu": "33",
    tamilnadu: "33",
    tn: "33",
    puducherry: "34",
    pondicherry: "34",
    py: "34",
    "andaman and nicobar islands": "35",
    "andaman and nicobar": "35",
    "andaman nicobar": "35",
    an: "35",
    telangana: "36",
    ts: "36",
    tg: "36",
    "andhra pradesh": "37",
    seemandhra: "37",
    ap: "37",
    ladakh: "38",
    la: "38",
    "other territory": "97",
    ot: "97",
    "centre jurisdiction": "99",
    "center jurisdiction": "99",
    cj: "99",
  };

  if (s && stateMap[s]) return stateMap[s];

  const pin = (pincode || "").trim();
  if (/^\d{6}$/.test(pin)) {
    if (/^11\d{4}$/.test(pin)) return "07";
    if (/^1[23]\d{4}$/.test(pin)) return "06";
    if (/^1[45]\d{4}$/.test(pin)) return "03";
    if (/^16\d{4}$/.test(pin)) return "04";
    if (/^17\d{4}$/.test(pin)) return "02";
    if (/^194\d{3}$/.test(pin)) return "38";
    if (/^1[89]\d{4}$/.test(pin)) return "01";
    if (/^2[0-8]\d{4}$/.test(pin)) return "09";
    if (/^3[0-4]\d{4}$/.test(pin)) return "08";
    if (/^3[6-9]\d{4}$/.test(pin)) return "24";
    if (/^403\d{3}$/.test(pin)) return "30";
    if (/^4[0-4]\d{4}$/.test(pin)) return "27";
    if (/^4[5-8]\d{4}$/.test(pin)) return "23";
    if (/^49\d{4}$/.test(pin)) return "22";
    if (/^50\d{4}$/.test(pin)) return "36";
    if (/^5[1-3]\d{4}$/.test(pin)) return "37";
    if (/^5[6-9]\d{4}$/.test(pin)) return "29";
    if (/^6[0-4]\d{4}$/.test(pin)) return "33";
    if (/^6[7-9]\d{4}$/.test(pin)) return "32";
    if (/^7[0-4]\d{4}$/.test(pin)) return "19";
    if (/^7[5-7]\d{4}$/.test(pin)) return "21";
    if (/^78\d{4}$/.test(pin)) return "18";
    if (/^8[0-5]\d{4}$/.test(pin)) return "10";
  }

  return "99";
}

/**
 * Authoritative server-side GST tax calculation (2.11 / Phase 05).
 * In India:
 * - Printed physical books are GST exempt (0% GST rate, HSN 4901).
 * - Shipping / transportation services carry 18% GST (inclusive in shipping fee).
 * - Platform handling fee (when charged) reconciles directly into grandTotal.
 * - Intra-state (seller state == destination state) applies CGST (9%) + SGST (9%).
 * - Inter-state (seller state != destination state) applies IGST (18%).
 */
export function calculateOrderTaxBreakdown(params: TaxCalculationParams): TaxBreakdown {
  const {
    subtotal,
    discount,
    shippingFee,
    platformFee = 0,
    stateCode = "",
    pincode = "",
    sellerStateCode,
    sellerGstin,
  } = params;

  let resolvedSellerState = "07";
  if (sellerStateCode) {
    resolvedSellerState = normalizeStateToGstCode(sellerStateCode);
  } else if (sellerGstin && /^[0-9]{2}/.test(sellerGstin.trim())) {
    resolvedSellerState = sellerGstin.trim().slice(0, 2);
  } else if (process.env.BUSINESS_STATE_CODE) {
    resolvedSellerState = normalizeStateToGstCode(process.env.BUSINESS_STATE_CODE);
  }

  const destStateCode = normalizeStateToGstCode(stateCode, pincode);
  const isInterstate = destStateCode !== resolvedSellerState;

  const netBooksValue = Math.max(0, roundCurrency(Number(subtotal || 0) - Number(discount || 0)));
  const cleanShipping = Math.max(0, roundCurrency(Number(shippingFee || 0)));
  const cleanPlatformFee = Math.max(0, roundCurrency(Number(platformFee || 0)));

  const booksGstRate = 0;
  const booksGstAmount = 0;

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (cleanShipping > 0) {
    const totalShippingTax = roundCurrency((cleanShipping * 18) / 118);

    if (isInterstate) {
      igstRate = 18.0;
      igstAmount = totalShippingTax;
    } else {
      cgstRate = 9.0;
      cgstAmount = roundCurrency(totalShippingTax / 2);
      sgstRate = 9.0;
      sgstAmount = roundCurrency(totalShippingTax - cgstAmount);
    }
  }

  const totalTax = roundCurrency(cgstAmount + sgstAmount + igstAmount);
  const grandTotal = roundCurrency(netBooksValue + cleanShipping + cleanPlatformFee);

  return {
    taxableValue: netBooksValue,
    platformFee: cleanPlatformFee,
    shippingFee: cleanShipping,
    sellerStateCode: resolvedSellerState,
    placeOfSupplyCode: destStateCode,
    isInterstate,
    booksGstRate,
    booksGstAmount,
    shippingGstRate: 18.0,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTax,
    grandTotal,
  };
}

export interface InvoiceEligibilityInput {
  order_status?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  is_paid?: boolean | null;
  cod_collection_status?: string | null;
  cod_settlement_status?: string | null;
}

/**
 * Pure invoice eligibility check shared across client UI guards and server invoice generation.
 * Blocks unpaid ONLINE orders, pre-delivery/uncollected COD orders, failed payments, and cancelled/returned orders.
 */
export function checkOrderInvoiceEligibility(order: InvoiceEligibilityInput): {
  eligible: boolean;
  errorCode?: string;
  reason?: string;
} {
  const orderStatus = String(order?.order_status || "");
  const paymentStatus = String(order?.payment_status || "");
  const paymentMethod = String(order?.payment_method || "").toUpperCase();

  if (orderStatus === "Cancelled" || orderStatus === "Returned") {
    return {
      eligible: false,
      errorCode: "INVOICE_ORDER_CANCELLED",
      reason: "Tax invoices cannot be generated for cancelled or returned orders without an existing invoice.",
    };
  }

  if (["Failed", "Refund Pending", "Refunded"].includes(paymentStatus)) {
    return {
      eligible: false,
      errorCode: "INVOICE_PAYMENT_INELIGIBLE",
      reason: `Tax invoice cannot be generated while payment status is "${paymentStatus}".`,
    };
  }

  if (paymentMethod === "ONLINE") {
    const isPaid =
      order?.is_paid === true ||
      paymentStatus === "Paid" ||
      paymentStatus === "Partially Refunded";
    if (!isPaid) {
      return {
        eligible: false,
        errorCode: "INVOICE_PAYMENT_UNPAID",
        reason: `Tax invoice cannot be generated for unpaid online order (status: ${paymentStatus || "Pending"}).`,
      };
    }
    return { eligible: true };
  }

  if (paymentMethod === "COD") {
    const codEligible =
      orderStatus === "Delivered" ||
      orderStatus === "Replacement Delivered" ||
      order?.is_paid === true ||
      paymentStatus === "Paid" ||
      paymentStatus === "Partially Refunded" ||
      order?.cod_collection_status === "collected" ||
      order?.cod_collection_status === "excess" ||
      order?.cod_settlement_status === "reconciled";

    if (!codEligible) {
      return {
        eligible: false,
        errorCode: "INVOICE_COD_NOT_ELIGIBLE",
        reason: "Tax invoice for Cash on Delivery orders is available only after delivery or confirmed COD payment collection.",
      };
    }
    return { eligible: true };
  }

  return {
    eligible: false,
    errorCode: "INVOICE_INVALID_PAYMENT_METHOD",
    reason: `Unsupported payment method "${paymentMethod || "UNKNOWN"}" for tax invoice.`,
  };
}
