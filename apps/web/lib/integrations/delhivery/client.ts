import { getIntegrationsConfig } from "../config";

export function getDelhiveryConfig() {
  const { delhivery } = getIntegrationsConfig();

  return {
    apiUrl: delhivery.apiUrl.replace(/\/$/, ""),
    token: delhivery.token,
    isConfigured: delhivery.isConfigured,
  };
}

