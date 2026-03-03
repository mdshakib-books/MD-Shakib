import crypto from "crypto";

// In a real production environment with multiple instances,
// this should ideally be backed by Redis for centralized idempotency tracking.
// For this single-instance layout, an in-memory Map with an expiry suffices,
// or we can store it directly in the Order model as a unique field.

const idempotencyCache = new Map();
const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const generateIdempotencyKey = (userId, suffix = "") => {
    return crypto
        .createHash("sha256")
        .update(`${userId}-${new Date().getTime()}-${suffix}`)
        .digest("hex");
};

export const checkAndSetIdempotency = (key) => {
    if (!key) return true; // bypass if no key provided

    const existing = idempotencyCache.get(key);
    if (existing) {
        // If it exists and hasn't expired, it's a duplicate request
        if (Date.now() - existing.timestamp < IDEMPOTENCY_EXPIRY_MS) {
            return false; // Not unique, prevent processing
        }
    }

    // Set new key
    idempotencyCache.set(key, { timestamp: Date.now() });

    // Cleanup old keys occasionally
    if (idempotencyCache.size > 10000) {
        const now = Date.now();
        for (const [k, v] of idempotencyCache.entries()) {
            if (now - v.timestamp > IDEMPOTENCY_EXPIRY_MS) {
                idempotencyCache.delete(k);
            }
        }
    }

    return true; // Unique, allow processing
};
