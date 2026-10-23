import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRecordedAnswer } from '../src/lib/recorded-audio.ts';

test('WAV preserves original signed microphone samples across chunks', () => {
  const buffer = encodeRecordedAnswer([new Int16Array([-32768, -120, 0]), new Int16Array([120, 32767])]);
  const view = new DataView(buffer);
  const text = (offset, count) => String.fromCharCode(...new Uint8Array(buffer, offset, count));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 10);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -120, 0, 120, 32767]);
});

test('one second of captured audio has the correct playable duration', () => {
  const buffer = encodeRecordedAnswer([new Int16Array(16000)]);
  const view = new DataView(buffer);
  assert.equal(view.getUint32(40, true) / view.getUint32(28, true), 1);
  assert.equal(buffer.byteLength, 32044);
});
