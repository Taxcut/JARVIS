import { it, expect, vi } from 'vitest';
import { createVoiceCredential, voiceInstructions } from './voice.js';
it('issues only a short-lived text conversation with no tools at the fixed provider', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        value: 'ephemeral-fixture',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }),
    ),
  );
  const result = await createVoiceCredential(
    'fixture-api-key',
    'gpt-realtime-2.1',
    'correlation',
    send,
  );
  expect(result.executionAvailable).toBe(false);
  const [url, options] = send.mock.calls[0]!;
  expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
  const body = JSON.parse(options!.body as string);
  expect(body.session.tools).toEqual([]);
  expect(body.session.tool_choice).toBe('none');
  expect(body.session.output_modalities).toEqual(['text']);
  expect(body.session.audio.input.turn_detection.type).toBe('semantic_vad');
  expect(body.expires_after.seconds).toBe(60);
  expect(voiceInstructions).toContain('NO tools');
});
it('never exposes provider error bodies or credentials and bounds responses', async () => {
  for (const response of [
    new Response('provider-secret', { status: 401 }),
    new Response('x'.repeat(32769)),
    new Response(JSON.stringify({ value: 'ephemeral-fixture', expires_at: 1 })),
  ]) {
    const send = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createVoiceCredential(
        'fixture-api-key',
        'gpt-realtime-2.1',
        'correlation',
        send,
      ),
    ).rejects.toMatchObject({ code: 'VOICE_PROVIDER_UNAVAILABLE' });
  }
});
it('distinguishes rate limits from malformed and unavailable providers', async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response('private provider payload', { status: 429 }),
    );
  await expect(
    createVoiceCredential(
      'fixture-api-key',
      'gpt-realtime-2.1',
      'correlation',
      send,
    ),
  ).rejects.toMatchObject({ code: 'VOICE_RATE_LIMITED' });
});
