import { z } from 'zod';

export const coreEnvSchema = z.object({
  OD_DAEMON_URL: z.string().url(),
  OD_API_TOKEN: z.string().default(''),
  OD_AUTH_MODE: z.enum(['none', 'bearer', 'basic']).optional(),
  OD_BASIC_USER: z.string().optional(),
  OD_BASIC_PASS: z.string().optional(),
});

export type AuthDescriptor =
  | { mode: 'none' }
  | { mode: 'bearer'; token: string }
  | { mode: 'basic'; user: string; pass: string };

export type CoreConfig = z.infer<typeof coreEnvSchema> & { auth: AuthDescriptor };

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
 * Resolve the AuthDescriptor from parsed env vars.
 * Throws Error (not ZodError) for cross-field validation failures.
 */
function resolveAuth(parsed: z.infer<typeof coreEnvSchema>): AuthDescriptor {
  const { OD_AUTH_MODE, OD_API_TOKEN, OD_BASIC_USER, OD_BASIC_PASS } = parsed;

  if (OD_AUTH_MODE !== undefined) {
    // Explicit mode — enforce matching credentials
    switch (OD_AUTH_MODE) {
      case 'none':
        return { mode: 'none' };
      case 'bearer':
        if (!OD_API_TOKEN) {
          throw new Error('OD_AUTH_MODE=bearer requires OD_API_TOKEN to be set');
        }
        return { mode: 'bearer', token: OD_API_TOKEN };
      case 'basic':
        if (!OD_BASIC_USER || !OD_BASIC_PASS) {
          throw new Error(
            'OD_AUTH_MODE=basic requires OD_BASIC_USER and OD_BASIC_PASS to be set',
          );
        }
        return { mode: 'basic', user: OD_BASIC_USER, pass: OD_BASIC_PASS };
    }
  }

  // Default inference (§B2)
  const hasToken = OD_API_TOKEN !== undefined && OD_API_TOKEN !== '';
  const hasBasic =
    OD_BASIC_USER !== undefined &&
    OD_BASIC_USER !== '' &&
    OD_BASIC_PASS !== undefined &&
    OD_BASIC_PASS !== '';

  if (hasToken && hasBasic) {
    throw new Error(
      'Both OD_API_TOKEN and OD_BASIC_USER/OD_BASIC_PASS are set. ' +
        'Set OD_AUTH_MODE=bearer or OD_AUTH_MODE=basic to disambiguate.',
    );
  }
  if (hasToken) {
    return { mode: 'bearer', token: OD_API_TOKEN };
  }
  if (hasBasic && OD_BASIC_USER && OD_BASIC_PASS) {
    return { mode: 'basic', user: OD_BASIC_USER, pass: OD_BASIC_PASS };
  }
  return { mode: 'none' };
}

/**
 * Parse core config from environment. Pure function, can be called with synthetic env for testing.
 * Throws ZodError for primitive validation failures, Error for cross-field auth validation.
 */
export function parseCore(env: NodeJS.ProcessEnv): CoreConfig {
  const parsed = coreEnvSchema.parse(env);

  // Reject embedded credentials in OD_DAEMON_URL (§B4)
  const url = new URL(parsed.OD_DAEMON_URL);
  if (url.username || url.password) {
    throw new Error(
      'OD_DAEMON_URL must not contain embedded credentials (user:pass@host). ' +
        'Use OD_BASIC_USER and OD_BASIC_PASS instead.',
    );
  }

  const auth = resolveAuth(parsed);
  return { ...parsed, auth };
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
          `Required: OD_DAEMON_URL (valid URL). Optional: OD_API_TOKEN, OD_AUTH_MODE, OD_BASIC_USER, OD_BASIC_PASS.\n`,
      );
      process.exit(1);
    }
    if (err instanceof Error) {
      process.stderr.write(
        `[open-design-mcp] FATAL: invalid core env vars\n  - ${err.message}\n`,
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
