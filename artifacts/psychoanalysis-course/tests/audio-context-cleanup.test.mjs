import test from 'node:test';
import assert from 'node:assert/strict';
import { closeCaptureAudioContext } from '../src/lib/audio-context-cleanup.ts';

test('repeated and concurrent cleanup close the audio context only once', async () => {
  let calls = 0;
  const capture = { context: { state: 'running', close: async () => { calls++; } } };
  await Promise.all([
    closeCaptureAudioContext(capture),
    closeCaptureAudioContext(capture),
    closeCaptureAudioContext(capture),
  ]);
  assert.equal(calls, 1);
  assert.equal(capture.context, null);
});

test('already-closed audio contexts are not closed again', async () => {
  let calls = 0;
  const capture = { context: { state: 'closed', close: async () => { calls++; throw new Error('Cannot close a closed AudioContext.'); } } };
  await closeCaptureAudioContext(capture);
  assert.equal(calls, 0);
  assert.equal(capture.context, null);
});

test('asynchronous close rejection does not escape cleanup', async () => {
  const capture = { context: { state: 'running', close: () => Promise.reject(new Error('Cannot close a closed AudioContext.')) } };
  await assert.doesNotReject(closeCaptureAudioContext(capture));
  await assert.doesNotReject(closeCaptureAudioContext(capture));
});

test('synchronous close errors and absent contexts are safe', async () => {
  const capture = { context: { state: 'suspended', close: () => { throw new Error('Already closing'); } } };
  await assert.doesNotReject(closeCaptureAudioContext(capture));
  await assert.doesNotReject(closeCaptureAudioContext({}));
});
