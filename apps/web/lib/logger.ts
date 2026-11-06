type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /otp/i,
  /signature/i,
  /service[_-]?role/i,
  /credit[_-]?card/i,
  /cvv/i,
  /pan/i,
  /ssn/i,
];

const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;

/**
 * Deeply redacts sensitive keys, secrets, tokens, and PII from objects and primitives.
 */
export function redactSensitiveData(data: any, depth = 0): any {
  if (depth > 6) return "[MAX_DEPTH]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Redact JWTs
    return data.replace(JWT_PATTERN, "[REDACTED_JWT]");
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === "object") {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return redacted;
  }

  return String(data);
}

export interface LogContext {
  userId?: string;
  orderId?: string;
  endpoint?: string;
  correlationId?: string;
  source?: string;
  [key: string]: any;
}

function emitLog(level: LogLevel, message: string, context?: LogContext, error?: any) {
  const isProduction = process.env.NODE_ENV === "production";
  const timestamp = new Date().toISOString();

  let errorInfo: Record<string, any> | undefined;
  if (error) {
    errorInfo = {
      message: error?.message || String(error),
      name: error?.name,
      code: error?.code,
      stack: isProduction ? undefined : error?.stack,
    };
  }

  const payload = {
    timestamp,
    level,
    message,
    ...(context ? { context: redactSensitiveData(context) } : {}),
    ...(errorInfo ? { error: redactSensitiveData(errorInfo) } : {}),
  };

  const outputString = isProduction ? JSON.stringify(payload) : null;

  switch (level) {
    case "DEBUG":
      if (!isProduction) console.debug(`[DEBUG] ${timestamp} - ${message}`, payload.context || "");
      break;
    case "INFO":
      if (isProduction) {
        console.log(outputString);
      } else {
        console.log(`[INFO] ${timestamp} - ${message}`, payload.context || "");
      }
      break;
    case "WARN":
      if (isProduction) {
        console.warn(outputString);
      } else {
        console.warn(`[WARN] ${timestamp} - ${message}`, payload.context || "");
      }
      break;
    case "ERROR":
      if (isProduction) {
        console.error(outputString);
      } else {
        console.error(`[ERROR] ${timestamp} - ${message}`, payload.context || "", payload.error || "");
      }
      break;
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    emitLog("DEBUG", message, context);
  },
  info(message: string, context?: LogContext) {
    emitLog("INFO", message, context);
  },
  warn(message: string, context?: LogContext, error?: any) {
    emitLog("WARN", message, context, error);
  },
  error(message: string, context?: LogContext, error?: any) {
    emitLog("ERROR", message, context, error);
  },
};

