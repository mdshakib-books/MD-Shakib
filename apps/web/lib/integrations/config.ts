/**
 * Integration configuration and environment variable validator.
 * Ensures secrets remain server-side and checks credential availability.
 */

export interface IntegrationStatus {
  razorpay: {
    configured: boolean;
    hasKeyId: boolean;
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
  };
  resend: {
    configured: boolean;
    hasApiKey: boolean;
    fromEmail: string;
  };
  cloudinary: {
    configured: boolean;
    hasCloudName: boolean;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  };
  delhivery: {
    configured: boolean;
    hasToken: boolean;
    hasWebhookSecret: boolean;
    apiUrl: string;
  };
}

export function getIntegrationsConfig() {
  const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  const resendApiKey = process.env.RESEND_API_KEY || "";
  const emailFrom = process.env.EMAIL_FROM || "MD Shakib Books <orders@mdshakib.com>";

  const cloudinaryCloudName =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || "";
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || "";

  const delhiveryToken = process.env.DELHIVERY_TOKEN || "";
  const delhiveryWebhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET || "";
  const delhiveryApiUrl = process.env.DELHIVERY_API_URL || "https://track.delhivery.com";

  return {
    razorpay: {
      keyId: razorpayKeyId,
      keySecret: razorpayKeySecret,
      webhookSecret: razorpayWebhookSecret,
      isConfigured: Boolean(razorpayKeyId && razorpayKeySecret),
    },
    resend: {
      apiKey: resendApiKey,
      fromEmail: emailFrom,
      isConfigured: Boolean(resendApiKey && !resendApiKey.startsWith("re_mock")),
    },
    cloudinary: {
      cloudName: cloudinaryCloudName,
      apiKey: cloudinaryApiKey,
      apiSecret: cloudinaryApiSecret,
      isConfigured: Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret && !cloudinaryApiKey.startsWith("mock")),
    },
    delhivery: {
      token: delhiveryToken,
      webhookSecret: delhiveryWebhookSecret,
      apiUrl: delhiveryApiUrl,
      isConfigured: Boolean(delhiveryToken && !delhiveryToken.startsWith("mock")),
    },
  };
}

export function checkIntegrationStatus(): IntegrationStatus {
  const config = getIntegrationsConfig();

  return {
    razorpay: {
      configured: config.razorpay.isConfigured,
      hasKeyId: Boolean(config.razorpay.keyId),
      hasKeySecret: Boolean(config.razorpay.keySecret),
      hasWebhookSecret: Boolean(config.razorpay.webhookSecret),
    },
    resend: {
      configured: config.resend.isConfigured,
      hasApiKey: Boolean(config.resend.apiKey),
      fromEmail: config.resend.fromEmail,
    },
    cloudinary: {
      configured: config.cloudinary.isConfigured,
      hasCloudName: Boolean(config.cloudinary.cloudName),
      hasApiKey: Boolean(config.cloudinary.apiKey),
      hasApiSecret: Boolean(config.cloudinary.apiSecret),
    },
    delhivery: {
      configured: config.delhivery.isConfigured,
      hasToken: Boolean(config.delhivery.token),
      hasWebhookSecret: Boolean(config.delhivery.webhookSecret),
      apiUrl: config.delhivery.apiUrl,
    },
  };
}

