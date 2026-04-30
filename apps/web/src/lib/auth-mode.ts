export function isAuthBypassed(): boolean {
  return process.env.BYPASS_AUTH === "true";
}

export function isWriteBypassed(): boolean {
  return isAuthBypassed() && process.env.BYPASS_AUTH_WRITES === "true";
}
