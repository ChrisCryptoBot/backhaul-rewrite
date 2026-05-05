import { z } from "zod";

export const queueEnvelopeVersion = "v1";

export const queueEventTypeSchema = z.enum(["PARSE_RATE_CON", "RECOMPUTE_WEEK_SNAPSHOT"]);

export const queueJobPayloadSchema = z.object({
  regionId: z.string().min(1),
  weekIso: z.string().regex(/^\d{4}-W\d{2}$/),
  entityId: z.string().min(1),
  eventType: queueEventTypeSchema
});

export type QueueJobPayload = z.infer<typeof queueJobPayloadSchema>;

export const parserFailureCodeSchema = z.enum(["invalid", "timeout", "schema", "low-confidence"]);
export type ParserFailureCode = z.infer<typeof parserFailureCodeSchema>;

export const parserExtractionSchema = z.object({
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupNumber: z.string().min(1),
  lineHaulRate: z.string().regex(/^\d+(\.\d{1,2})?$/),
  loadedMiles: z.string().regex(/^\d+(\.\d{1,2})?$/),
  shipperName: z.string().min(1),
  receiverName: z.string().min(1),
  brokerName: z.string().min(1),
  loadNumber: z.string().min(1),
  originCityState: z.string().min(3),
  destinationCityState: z.string().min(3)
});

export const parserResultSchema = z.object({
  extractedPayload: parserExtractionSchema,
  confidence: z.number().min(0).max(1),
  parserVersion: z.string().min(1)
});

export type ParserResult = z.infer<typeof parserResultSchema>;

export const queueEnvelopeSchema = z.object({
  contractVersion: z.literal(queueEnvelopeVersion),
  payload: queueJobPayloadSchema
});

export type QueueEnvelope = z.infer<typeof queueEnvelopeSchema>;

