// ── Regex patterns ────────────────────────────────────────────────────────────
export const REGEX = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[0-9]{10}$/,
    // strong password: min 6 chars, uppercase, lowercase, digit, special char
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/,
    name: /^[A-Za-z ]{2,50}$/,
    pincode: /^[0-9]{6}$/,
};

// ── Per-field messages ────────────────────────────────────────────────────────
const MESSAGES = {
    email: "Enter a valid email address",
    phone: "Mobile number must be exactly 10 digits",
    password:
        "Password must be min 6 chars with uppercase, lowercase, number & special character",
    name: "Name must contain only letters (2–50 characters)",
    pincode: "PIN code must be exactly 6 digits",
};

/**
 * Validate a single field value.
 * @param {"email"|"phone"|"password"|"name"|"pincode"} field
 * @param {string} value
 * @returns {string|null}  error message or null if valid
 */
export const validateField = (field, value) => {
    if (!value || !value.toString().trim())
        return `${capitalize(field)} is required`;
    if (REGEX[field] && !REGEX[field].test(value.toString().trim())) {
        return MESSAGES[field] || `Invalid ${field}`;
    }
    return null;
};

/**
 * Validate multiple fields at once.
 * @param {Record<string, string>} fields  e.g. { email: "...", phone: "..." }
 * @returns {Record<string, string>}  { field: errorMsg } — empty obj means valid
 */
export const validateForm = (fields) => {
    const errors = {};
    Object.entries(fields).forEach(([key, value]) => {
        const err = validateField(key, value);
        if (err) errors[key] = err;
    });
    return errors;
};

/**
 * Validate passwords match (separate helper used by register / reset forms).
 * @returns {string|null}
 */
export const validatePasswordMatch = (password, confirm) => {
    if (!confirm) return "Please confirm your password";
    if (password !== confirm) return "Passwords do not match";
    return null;
};

// ── helpers ───────────────────────────────────────────────────────────────────
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Tailwind class helper — returns border class based on error state.
 */
export const inputBorder = (hasError) =>
    hasError
        ? "border-red-600 focus:border-red-500"
        : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]";
