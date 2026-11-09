/**
 * Validated environment access.
 *
 * Server-side only — never import this from a client component.
 *
 * Two required values (DATABASE_URL, AUTH_SECRET) fail fast with a readable
 * message. Everything else is optional so the app runs locally before Stripe,
 * Anthropic, or any ad platform is configured; `features` reports what is
 * actually wired up so the UI can degrade honestly instead of crashing.
 */
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET is required (generate: openssl rand -base64 32)"),
  AUTH_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),

  IP_HASH_SALT: z.string().default(""),

  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL_BRIEF: z.string().default("claude-opus-5"),
  AI_MODEL_CHAT: z.string().default("claude-sonnet-5-5"),

  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),

  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("TrueROAS <noreply@example.com>"),

  CRON_SECRET: z.string().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function load(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * Validation is deferred to first access rather than run at import.
 *
 * Importing a module must not be able to throw: a module-load-time check takes
 * down `next build` on any machine without a full .env, and makes every file
 * that transitively imports this one untestable.
 */
export const env = new Proxy({} as Env, {
  get: (_target, prop: string) => load()[prop as keyof Env],
  has: (_target, prop: string) => prop in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

type Features = {
  ai: boolean;
  billing: boolean;
  email: boolean;
  ipHashing: boolean;
};

function computeFeatures(): Features {
  const e = load();
  return {
    ai: e.ANTHROPIC_API_KEY.length > 0,
    billing: e.STRIPE_SECRET_KEY.length > 0,
    email: e.RESEND_API_KEY.length > 0,
    /** Skipped entirely when no salt is set, rather than using a weak one. */
    ipHashing: e.IP_HASH_SALT.length >= 16,
  };
}

/** What is actually configured. Drives honest empty states, not crashes. */
export const features = new Proxy({} as Features, {
  get: (_target, prop: string) => computeFeatures()[prop as keyof Features],
});
