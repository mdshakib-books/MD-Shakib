/**
 * Next.js Server Startup Instrumentation Hook.
 * Validates environment configuration and safety boundaries at application startup
 * before serving requests (server-side Node.js runtime).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertValidServerEnvOnStartup } = await import("@/lib/env/server");
    assertValidServerEnvOnStartup();
  }
}
