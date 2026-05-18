import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseCore, parseByok } from '../config.js';

describe('config.ts', () => {
  describe('parseCore', () => {
    it('parses valid core config with URL only', () => {
      const env = { OD_DAEMON_URL: 'http://localhost:7456' };
      const cfg = parseCore(env);
      expect(cfg).toEqual({
        OD_DAEMON_URL: 'http://localhost:7456',
        OD_API_TOKEN: '',
      });
    });

    it('parses valid core config with URL and token', () => {
      const env = {
        OD_DAEMON_URL: 'http://ai-open-design:7456',
        OD_API_TOKEN: 'secret-token-abc',
      };
      const cfg = parseCore(env);
      expect(cfg).toEqual({
        OD_DAEMON_URL: 'http://ai-open-design:7456',
        OD_API_TOKEN: 'secret-token-abc',
      });
    });

    it('throws ZodError if OD_DAEMON_URL is missing', () => {
      const env = {};
      expect(() => parseCore(env)).toThrow(z.ZodError);
    });

    it('throws ZodError if OD_DAEMON_URL is not a valid URL', () => {
      const env = { OD_DAEMON_URL: 'not-a-url' };
      expect(() => parseCore(env)).toThrow(z.ZodError);
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
