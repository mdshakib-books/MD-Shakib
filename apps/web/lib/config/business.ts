/**
 * Authoritative Business Information & Statutory E-Commerce Disclosures Configuration.
 * 
 * Sourced strictly from verified environment variables with safe fallbacks for development/staging.
 * Complies with Consumer Protection (E-Commerce) Rules, 2020 and DPDPA 2023.
 * Fails closed against fictional placeholder numbers in production.
 */

export interface GrievanceOfficerConfig {
  name: string;
  designation: string;
  email: string;
  phone: string;
  address: string;
  ackSlaHours: number;
  resolutionSlaDays: number;
}

export interface BusinessConfig {
  brandName: string;
  tradeName: string;
  legalEntityName: string;
  registeredAddress: string;
  supportEmail: string;
  supportPhone: string;
  gstin: string;
  cin?: string;
  grievanceOfficer: GrievanceOfficerConfig;
  shipping: {
    carrier: string;
    estimatedDeliveryDays: string;
    standardShippingFee: number;
  };
  cancellation: {
    allowedBeforeDispatch: boolean;
    allowedAfterDispatch: boolean;
  };
  returns: {
    windowDays: number;
    condition: string;
    refundProcessingDays: string;
  };
  jurisdiction: string;
}

const isProduction = process.env.NODE_ENV === "production";

export const BUSINESS_CONFIG: BusinessConfig = {
  brandName: "MD Shakib Islamic Books",
  tradeName: "MD Shakib",
  legalEntityName:
    process.env.BUSINESS_LEGAL_NAME ||
    (isProduction ? "" : "MD Shakib Islamic Books (Proprietorship)"),
  registeredAddress:
    process.env.BUSINESS_REGISTERED_ADDRESS ||
    (isProduction ? "" : "Daryaganj, Central Delhi, New Delhi 110002, India"),
  supportEmail: process.env.EMAIL_SUPPORT || "support@mdshakib.com",
  supportPhone:
    process.env.BUSINESS_PHONE ||
    (isProduction ? "" : "+91 11 2327 0000"),
  gstin: process.env.BUSINESS_GSTIN || (isProduction ? "" : "07AABCM1234F1Z5"),
  cin: process.env.BUSINESS_CIN || undefined,
  grievanceOfficer: {
    name:
      process.env.GRIEVANCE_OFFICER_NAME ||
      (isProduction ? "" : "Grievance Redressal Officer"),
    designation:
      process.env.GRIEVANCE_OFFICER_DESIGNATION ||
      "Head of Customer Redressal & Compliance",
    email: process.env.GRIEVANCE_OFFICER_EMAIL || "grievance@mdshakib.com",
    phone:
      process.env.GRIEVANCE_OFFICER_PHONE ||
      (isProduction ? "" : "+91 11 2327 0000"),
    address:
      process.env.GRIEVANCE_OFFICER_ADDRESS ||
      process.env.BUSINESS_REGISTERED_ADDRESS ||
      (isProduction ? "" : "Daryaganj, Central Delhi, New Delhi 110002, India"),
    ackSlaHours: 48,
    resolutionSlaDays: 30,
  },
  shipping: {
    carrier: "Delhivery Logistics",
    estimatedDeliveryDays: "3–7 business days",
    standardShippingFee: 49,
  },
  cancellation: {
    allowedBeforeDispatch: true,
    allowedAfterDispatch: false,
  },
  returns: {
    windowDays: 7,
    condition:
      "Original unread/unmarked condition with original packaging, or damaged/defective upon arrival",
    refundProcessingDays: "5–7 business days via original payment method",
  },
  jurisdiction: "Courts of competent jurisdiction in New Delhi, India",
};

/**
 * Returns customer-facing business disclosures, ensuring no placeholder or fake numbers are displayed.
 */
export function getBusinessDisclosures() {
  const hasLegalEntity = Boolean(BUSINESS_CONFIG.legalEntityName.trim());
  const hasAddress = Boolean(BUSINESS_CONFIG.registeredAddress.trim());
  const hasPhone = Boolean(BUSINESS_CONFIG.supportPhone.trim());
  const hasGrievanceOfficer = Boolean(BUSINESS_CONFIG.grievanceOfficer.name.trim());

  return {
    ...BUSINESS_CONFIG,
    isFullyConfigured: hasLegalEntity && hasAddress && hasPhone && hasGrievanceOfficer,
    displayLegalName: hasLegalEntity
      ? BUSINESS_CONFIG.legalEntityName
      : "MD Shakib Islamic Books",
    displayAddress: hasAddress
      ? BUSINESS_CONFIG.registeredAddress
      : "Registered business office details available upon request (contact support@mdshakib.com)",
    displayPhone: hasPhone ? BUSINESS_CONFIG.supportPhone : null,
  };
}
