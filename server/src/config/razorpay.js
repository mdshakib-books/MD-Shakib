import Razorpay from "razorpay";
import { ApiError } from "../utils/ApiError.js";

const RAZORPAY_ENV_KEYS = {
    keyId: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY"],
    keySecret: ["RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET"],
};

const readFirstAvailableEnv = (keys = []) => {
    for (const key of keys) {
        const value = String(process.env[key] || "").trim();
        if (value) return value;
    }
    return "";
};

const getRazorpayCredentials = () => {
    const keyId = readFirstAvailableEnv(RAZORPAY_ENV_KEYS.keyId);
    const keySecret = readFirstAvailableEnv(RAZORPAY_ENV_KEYS.keySecret);
    return { keyId, keySecret };
};

let razorpayInstance = null;
let cachedCredentialFingerprint = "";

export const isRazorpayConfigured = () => {
    const { keyId, keySecret } = getRazorpayCredentials();
    return Boolean(keyId && keySecret);
};

export const getRazorpayConfigStatus = () => {
    const { keyId, keySecret } = getRazorpayCredentials();
    const missingKeys = [];

    if (!keyId) missingKeys.push(RAZORPAY_ENV_KEYS.keyId.join(" or "));
    if (!keySecret)
        missingKeys.push(RAZORPAY_ENV_KEYS.keySecret.join(" or "));

    return {
        configured: missingKeys.length === 0,
        missingKeys,
        keyId,
    };
};

export const getRazorpayKeyId = () => getRazorpayCredentials().keyId;
export const getRazorpayKeySecret = () =>
    getRazorpayCredentials().keySecret;

export const getRazorpayInstance = () => {
    const { keyId, keySecret } = getRazorpayCredentials();
    if (!keyId || !keySecret) {
        throw new ApiError(
            500,
            "Payment gateway is not configured. Please contact support.",
        );
    }

    const nextFingerprint = `${keyId}:${keySecret}`;
    if (!razorpayInstance || cachedCredentialFingerprint !== nextFingerprint) {
        razorpayInstance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });
        cachedCredentialFingerprint = nextFingerprint;
    }

    return razorpayInstance;
};

export { razorpayInstance };
