/**
 * The client factory and the free pre-flight check, offline.
 *
 * The check exists so the first live run cannot spend anything on a key that
 * is scoped wrong, a key that is bad, or a console with no credit. Each of
 * those is a 4xx the SDK turns into a typed error; the tests build those
 * errors the way the SDK does and read the sentence the rep would see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';

import { WORKSPACE_HEADER, anthropicFromEnv, describePreflightError, preflight } from '../src/anthropic.ts';

function apiError(status: number, message: string): InstanceType<typeof Anthropic.APIError> {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'invalid_request_error', message } },
    undefined,
    new Headers(),
  );
}

test('no key is a plain sentence before any client exists', () => {
  assert.throws(() => anthropicFromEnv({}), /ANTHROPIC_API_KEY is not set/);
});

test('an organization-scoped key gets the workspace header from .env; a workspace key sends none', () => {
  const withWorkspace = anthropicFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_WORKSPACE_ID: ' wrkspc_01 ' });
  assert.equal(withWorkspace.apiKey, 'sk-ant-test');
  const headers = (withWorkspace as unknown as { _options: { defaultHeaders?: Record<string, string> } })._options.defaultHeaders;
  assert.equal(headers?.[WORKSPACE_HEADER], 'wrkspc_01', 'trimmed and sent');

  const without = anthropicFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
  const none = (without as unknown as { _options: { defaultHeaders?: Record<string, string> } })._options.defaultHeaders;
  assert.equal(none?.[WORKSPACE_HEADER], undefined);
});

test('the pre-flight passes on a model record and names the failure otherwise', async () => {
  const ok = await preflight({ models: { retrieve: async () => ({ id: 'claude-opus-5-5' }) } }, 'claude-opus-5-5');
  assert.deepEqual(ok, { ok: true, reason: '' });

  const workspace = apiError(400, 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.');
  const bad = await preflight({ models: { retrieve: async () => { throw workspace; } } }, 'claude-opus-5-5');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /scoped to the organization/);
  assert.match(bad.reason, /ANTHROPIC_WORKSPACE_ID=wrkspc_/);
  assert.match(bad.reason, /Workspaces › your workspace › API keys/);
});

test('each 4xx the console can produce reads as what to do about it', () => {
  assert.match(describePreflightError(apiError(401, 'invalid x-api-key'), 'm'), /Check ANTHROPIC_API_KEY/);
  assert.match(describePreflightError(apiError(400, 'Your credit balance is too low to access the Anthropic API.'), 'm'), /no usable credit.*Add funds/);
  assert.match(describePreflightError(apiError(403, 'forbidden'), 'm'), /not allowed/);
  assert.match(describePreflightError(apiError(404, 'model: nope'), 'claude-nope'), /claude-nope is not available/);
  assert.match(describePreflightError(apiError(429, 'slow down'), 'm'), /Rate limited/);
  assert.match(describePreflightError(apiError(500, 'oops'), 'm'), /answered 500/);
  assert.match(describePreflightError(new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' }), 'm'), /Could not reach api\.anthropic\.com/);
  assert.match(describePreflightError(new Error('boom'), 'm'), /pre-flight check failed: boom/);
});
