import { getIntegrationsConfig, getServiceValidationErrors } from "../config";

export function getDelhiveryConfig() {
  const config = getIntegrationsConfig();
  const { delhivery } = config;
  const validationErrors = getServiceValidationErrors(config.snapshot, "delhivery");

  return {
    apiUrl: delhivery.apiUrl.replace(/\/$/, ""),
    token: delhivery.token,
    webhookSecret: delhivery.webhookSecret,
    pickupLocation: delhivery.pickupLocation,
    enabled: delhivery.enabled,
    mode: delhivery.mode,
    isConfigured: delhivery.enabled && delhivery.isConfigured && validationErrors.length === 0,
    operational: delhivery.operational && validationErrors.length === 0,
    isProduction: config.isProduction,
    allowMock: delhivery.allowMock && validationErrors.length === 0,
    validationErrors,
  };
}
