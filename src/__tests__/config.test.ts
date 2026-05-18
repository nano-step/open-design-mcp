import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseCore, parseByok } from '../config.js';

describe('config.ts', () => {
  describe('parseCore', () => {
    it('parses valid core config with URL only', () => {
      const env = { OD_DAEMON_URL: 'http://localhost:7456' };
      const cfg = parseCore(env);
      expect(cfg.OD_DAEMON_URL).toBe('http://localhost:7456');
      expect(cfg.OD_API_TOKEN).toBe('');
      expect(cfg.auth).toEqual({ mode: 'none' });
    });

    it('parses valid core config with URL and token', () => {
      const env = {
        OD_DAEMON_URL: 'http://ai-open-design:7456',
        OD_API_TOKEN: 'secret-token-abc',
      };
      const cfg = parseCore(env);
      expect(cfg.OD_DAEMON_URL).toBe('http://ai-open-design:7456');
      expect(cfg.OD_API_TOKEN).toBe('secret-token-abc');
      expect(cfg.auth).toEqual({ mode: 'bearer', token: 'secret-token-abc' });
    });

    it('throws ZodError if OD_DAEMON_URL is missing', () => {
      const env = {};
      expect(() => parseCore(env)).toThrow(z.ZodError);
    });

    it('throws ZodError if OD_DAEMON_URL is not a valid URL', () => {
      const env = { OD_DAEMON_URL: 'not-a-url' };
      expect(() => parseCore(env)).toThrow(z.ZodError);
    });

    it('infers mode=none when only OD_DAEMON_URL is set', () => {
      const cfg = parseCore({ OD_DAEMON_URL: 'http://localhost:7456' });
      expect(cfg.auth).toEqual({ mode: 'none' });
    });

    it('infers mode=bearer when OD_API_TOKEN is set', () => {
      const cfg = parseCore({
        OD_DAEMON_URL: 'http://localhost:7456',
        OD_API_TOKEN: 'tok123',
      });
      expect(cfg.auth).toEqual({ mode: 'bearer', token: 'tok123' });
    });

    it('infers mode=basic when OD_BASIC_USER and OD_BASIC_PASS are set', () => {
      const cfg = parseCore({
        OD_DAEMON_URL: 'http://localhost:7456',
        OD_BASIC_USER: 'alice',
        OD_BASIC_PASS: 'secret',
      });
      expect(cfg.auth).toEqual({ mode: 'basic', user: 'alice', pass: 'secret' });
    });

    it('throws on ambiguous defaults when both token and basic creds are set', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_API_TOKEN: 'tok',
          OD_BASIC_USER: 'alice',
          OD_BASIC_PASS: 'secret',
        }),
      ).toThrow(/disambiguate/);
    });

    it('throws when OD_AUTH_MODE=basic but OD_BASIC_USER is missing', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_AUTH_MODE: 'basic',
          OD_BASIC_PASS: 'secret',
        }),
      ).toThrow(/OD_BASIC_USER/);
    });

    it('throws when OD_AUTH_MODE=basic but OD_BASIC_PASS is missing', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_AUTH_MODE: 'basic',
          OD_BASIC_USER: 'alice',
        }),
      ).toThrow(/OD_BASIC_PASS/);
    });

    it('throws when OD_AUTH_MODE=bearer but OD_API_TOKEN is missing', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_AUTH_MODE: 'bearer',
        }),
      ).toThrow(/OD_API_TOKEN/);
    });

    it('rejects OD_DAEMON_URL with embedded credentials', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'https://u:p@host.example.com/',
        }),
      ).toThrow(/OD_BASIC/);
    });

    it('rejects OD_DAEMON_URL with embedded username only', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'https://alice@host.example.com/',
        }),
      ).toThrow(/OD_BASIC/);
    });

    it('throws ZodError for invalid OD_AUTH_MODE value', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_AUTH_MODE: 'oauth',
        }),
      ).toThrow(z.ZodError);
    });

    it('defaults OD_GENERATE_TIMEOUT_MS to 600000 when unset (issue #33)', () => {
      const cfg = parseCore({ OD_DAEMON_URL: 'http://localhost:7456' });
      expect(cfg.OD_GENERATE_TIMEOUT_MS).toBe(600_000);
    });

    it('honors explicit OD_GENERATE_TIMEOUT_MS as numeric string', () => {
      const cfg = parseCore({
        OD_DAEMON_URL: 'http://localhost:7456',
        OD_GENERATE_TIMEOUT_MS: '300000',
      });
      expect(cfg.OD_GENERATE_TIMEOUT_MS).toBe(300_000);
    });

    it('rejects non-numeric OD_GENERATE_TIMEOUT_MS', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_GENERATE_TIMEOUT_MS: 'abc',
        }),
      ).toThrow(z.ZodError);
    });

    it('rejects zero or negative OD_GENERATE_TIMEOUT_MS', () => {
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_GENERATE_TIMEOUT_MS: '0',
        }),
      ).toThrow(z.ZodError);
      expect(() =>
        parseCore({
          OD_DAEMON_URL: 'http://localhost:7456',
          OD_GENERATE_TIMEOUT_MS: '-1',
        }),
      ).toThrow(z.ZodError);
    });
  });

  describe('parseByok', () => {
    it('parses valid BYOK config with required vars only, provider defaults to openai', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.openai.com/v1',
        BYOK_API_KEY: 'sk-1234567890',
        BYOK_MODEL: 'gpt-4',
      };
      const cfg = parseByok(env);
      expect(cfg).toEqual({
        BYOK_BASE_URL: 'https://api.openai.com/v1',
        BYOK_API_KEY: 'sk-1234567890',
        BYOK_MODEL: 'gpt-4',
        BYOK_PROVIDER: 'openai',
      });
    });

    it('parses BYOK config with provider=openai', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.openai.com/v1',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'gpt-4',
        BYOK_PROVIDER: 'openai',
      };
      const cfg = parseByok(env);
      expect(cfg.BYOK_PROVIDER).toBe('openai');
    });

    it('parses BYOK config with provider=anthropic', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.anthropic.com/v1',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'claude-sonnet',
        BYOK_PROVIDER: 'anthropic',
      };
      const cfg = parseByok(env);
      expect(cfg.BYOK_PROVIDER).toBe('anthropic');
    });

    it('parses BYOK config with provider=azure', () => {
      const env = {
        BYOK_BASE_URL: 'https://example.openai.azure.com/',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'gpt-4',
        BYOK_PROVIDER: 'azure',
      };
      const cfg = parseByok(env);
      expect(cfg.BYOK_PROVIDER).toBe('azure');
    });

    it('parses BYOK config with provider=google', () => {
      const env = {
        BYOK_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'gemini-2.0-flash',
        BYOK_PROVIDER: 'google',
      };
      const cfg = parseByok(env);
      expect(cfg.BYOK_PROVIDER).toBe('google');
    });

    it('parses BYOK config with provider=ollama', () => {
      const env = {
        BYOK_BASE_URL: 'http://localhost:11434/v1',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'llama2',
        BYOK_PROVIDER: 'ollama',
      };
      const cfg = parseByok(env);
      expect(cfg.BYOK_PROVIDER).toBe('ollama');
    });

    it('throws ZodError if provider is invalid', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.example.com/v1',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'model',
        BYOK_PROVIDER: 'invalid-provider',
      };
      expect(() => parseByok(env)).toThrow(z.ZodError);
    });

    it('throws ZodError if BYOK_API_KEY is empty string', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.example.com/v1',
        BYOK_API_KEY: '',
        BYOK_MODEL: 'model',
      };
      expect(() => parseByok(env)).toThrow(z.ZodError);
    });

    it('throws ZodError if BYOK_MODEL is empty string', () => {
      const env = {
        BYOK_BASE_URL: 'https://api.example.com/v1',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: '',
      };
      expect(() => parseByok(env)).toThrow(z.ZodError);
    });

    it('throws ZodError if BYOK_BASE_URL is not a valid URL', () => {
      const env = {
        BYOK_BASE_URL: 'not-a-url',
        BYOK_API_KEY: 'key',
        BYOK_MODEL: 'model',
      };
      expect(() => parseByok(env)).toThrow(z.ZodError);
    });
  });
});
