import { z } from "zod";

export const envSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string().min(1),
  S3_BUCKET_NAME: z.string().min(1),
  SQS_PARSE_QUEUE_URL: z.string().url(),
  SQS_RECOMPUTE_QUEUE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  PHASE1_REGION_CODE: z.string().regex(/^[A-Z]{2,4}$/).default("NE")
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env vars: ${errors}`);
  }
  return parsed.data;
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}
