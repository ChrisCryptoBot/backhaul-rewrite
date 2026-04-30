import { z } from "zod";
import type { FuelSurchargeSource } from "@prisma/client";

const WireFscSourceSchema = z.enum(["ashley-manual-tuesday", "manual-override"]);
export type WireFscSource = z.infer<typeof WireFscSourceSchema>;

export function parseWireFscSource(value: unknown): WireFscSource {
  return WireFscSourceSchema.parse(value);
}

export function mapWireToDbFscSource(source: WireFscSource): FuelSurchargeSource {
  return source === "manual-override" ? "manual_override" : "ashley_manual_tuesday";
}

export function mapDbToWireFscSource(source: FuelSurchargeSource): WireFscSource {
  return source === "manual_override" ? "manual-override" : "ashley-manual-tuesday";
}
