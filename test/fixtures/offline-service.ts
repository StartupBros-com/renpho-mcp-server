import { RenphoApiService } from "../../src/services/renpho-api.js";

export function installOfflineFetchGuard(): void {
  globalThis.fetch = async () => {
    throw new Error("Real fetch forbidden in offline tests");
  };
}

export function createOfflineRenphoService(): RenphoApiService {
  return new RenphoApiService("offline@example.invalid", "offline");
}
