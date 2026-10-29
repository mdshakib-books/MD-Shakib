import { Resend } from "resend";
import { getIntegrationsConfig } from "../config";

let resendInstance: Resend | null = null;

export function getResendClient(): Resend | null {
  const { resend } = getIntegrationsConfig();

  if (!resend.apiKey) {
    return null;
  }

  if (!resendInstance) {
    resendInstance = new Resend(resend.apiKey);
  }

  return resendInstance;
}

