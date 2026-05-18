import { z } from 'zod';

export const coreEnvSchema = z.object({
  OD_DAEMON_URL: z.string().url(),
  OD_API_TOKEN: z.string().default(''),
});
export type CoreConfig = z.infer<typeof coreEnvSchema>;

export const byokEnvSchema = z.object({
  BYOK_BASE_URL: z.string().url(),
  BYOK_API_KEY: z.string().min(1),
  BYOK_MODEL: z.string().min(1),
  BYOK_PROVIDER: z
    .enum(['openai', 'anthropic', 'azure', 'google', 'ollama'])
    .default('openai'),
});
export type ByokConfig = z.infer<typeof byokEnvSchema>;

/**
 * Parse core config from environment. Pure function, can be called with synthetic env for testing.
 * Throws ZodError if validation fails.
 */
export function parseCore(env: NodeJS.ProcessEnv): CoreConfig {
  return coreEnvSchema.parse(env);
}

/**
 * Parse BYOK config from environment. Pure function, can be called with synthetic env for testing.
 * Throws ZodError if validation fails.
 */
export function parseByok(env: NodeJS.ProcessEnv): ByokConfig {
  return byokEnvSchema.parse(env);
}

/**
 * Load core config at module startup. Crashes with clear stderr if OD_DAEMON_URL missing/invalid.
 */
function loadCoreOrExit(): CoreConfig {
  try {
    return parseCore(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      process.stderr.write(
        `[open-design-mcp] FATAL: invalid core env vars\n${issues}\n` +
          `Required: OD_DAEMON_URL (valid URL). Optional: OD_API_TOKEN (default: empty).\n`,
      );
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Load core config. Server bootstrap (`src/server.ts`) calls this exactly once
 * at startup. The function exits the process with a clear stderr message if
 * OD_DAEMON_URL is missing or invalid.
 *
 * NOT exported as a top-level singleton because that would crash test suites
 * that merely import this module — vitest cannot intercept `process.exit(1)`
 * during module evaluation.
 */
export function loadCoreConfig(): CoreConfig {
  return loadCoreOrExit();
}

/**
 * Get BYOK config. Called lazily by od_generate_design handler.
 * Throws ZodError if any required var is missing.
 */
export function getByokConfig(): ByokConfig {
  return parseByok(process.env);
}
