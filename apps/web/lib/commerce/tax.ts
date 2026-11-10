export interface TaxCalculationParams {
  subtotal: number;
  discount: number;
  shippingFee: number;
  stateCode?: string;
  sellerStateCode?: string;
  sellerGstin?: string;
}

export interface TaxBreakdown {
  taxableValue: number;
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

/**
 * Normalizes state name, abbreviation, or code to 2-digit Indian GST State Code.
 */
export function normalizeStateToGstCode(input?: string): string {
  if (!input) return "99";
  const s = input.trim().toLowerCase();

  // If already a 2-digit number
  if (/^[0-9]{2}$/.test(s)) return s;

  if (["delhi", "dl", "new delhi", "nct of delhi", "delhi ncr"].includes(s)) return "07";
  if (["uttar pradesh", "up", "uttarpradesh"].includes(s)) return "09";
  if (["haryana", "hr"].includes(s)) return "06";
  if (["punjab", "pb"].includes(s)) return "03";
  if (["rajasthan", "rj"].includes(s)) return "08";
  if (["maharashtra", "mh"].includes(s)) return "27";
  if (["karnataka", "ka"].includes(s)) return "29";
  if (["gujarat", "gj"].includes(s)) return "24";
  if (["tamil nadu", "tn", "tamilnadu"].includes(s)) return "33";
  if (["west bengal", "wb", "bengal"].includes(s)) return "19";
  if (["bihar", "br"].includes(s)) return "10";
  if (["telangana", "ts", "tg"].includes(s)) return "36";
  if (["andhra pradesh", "ap"].includes(s)) return "37";
  if (["kerala", "kl"].includes(s)) return "32";
  if (["madhya pradesh", "mp"].includes(s)) return "23";
  if (["odisha", "or", "od", "orissa"].includes(s)) return "21";
  if (["chhattisgarh", "cg", "chattisgarh"].includes(s)) return "22";
  if (["jharkhand", "jh"].includes(s)) return "20";
  if (["assam", "as"].includes(s)) return "18";
  if (["chandigarh", "ch"].includes(s)) return "04";
  if (["jammu and kashmir", "jk", "j&k"].includes(s)) return "01";
  if (["himachal pradesh", "hp"].includes(s)) return "02";
  if (["uttarakhand", "uk", "uttaranchal"].includes(s)) return "05";
  if (["goa", "ga"].includes(s)) return "30";

  return "99";
}

/**
 * Authoritative server-side GST tax calculation (2.11).
 * In India:
 * - Printed physical books are generally GST exempt (0% GST rate).
 * - Shipping / transportation services carry 18% GST (inclusive in shipping fee).
 * - Intra-state (seller state == destination state) applies CGST (9%) + SGST (9%).
 * - Inter-state (seller state != destination state) applies IGST (18%).
 */
export function calculateOrderTaxBreakdown(params: TaxCalculationParams): TaxBreakdown {
  const { subtotal, discount, shippingFee, stateCode = "", sellerStateCode, sellerGstin } = params;

  // Determine seller state code (2 digits)
  let resolvedSellerState = "07"; // default to Delhi
  if (sellerStateCode) {
    resolvedSellerState = normalizeStateToGstCode(sellerStateCode);
  } else if (sellerGstin && sellerGstin.length >= 2 && /^[0-9]{2}/.test(sellerGstin)) {
    resolvedSellerState = sellerGstin.slice(0, 2);
  } else if (process.env.BUSINESS_STATE_CODE) {
    resolvedSellerState = normalizeStateToGstCode(process.env.BUSINESS_STATE_CODE);
  }

  const destStateCode = normalizeStateToGstCode(stateCode);
  const isInterstate = destStateCode !== resolvedSellerState;

  // Taxable value for books after discount allocation
  const netBooksValue = Math.max(0, Number((subtotal - discount).toFixed(2)));

  // Books GST (0%)
  const booksGstRate = 0;
  const booksGstAmount = 0;

  // Shipping GST (18% inclusive)
  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (shippingFee > 0) {
    // 18% reverse calculation: tax = shippingFee * 18 / 118
    const totalShippingTax = Number(((shippingFee * 18) / 118).toFixed(2));

    if (isInterstate) {
      igstRate = 18.0;
      igstAmount = totalShippingTax;
    } else {
      cgstRate = 9.0;
      cgstAmount = Number((totalShippingTax / 2).toFixed(2));
      sgstRate = 9.0;
      sgstAmount = Number((totalShippingTax - cgstAmount).toFixed(2));
    }
  }

  const totalTax = Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
  const grandTotal = Number((netBooksValue + shippingFee).toFixed(2));

  return {
    taxableValue: netBooksValue,
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
