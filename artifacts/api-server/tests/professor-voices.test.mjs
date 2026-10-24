import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfessorVoice } from '../src/lib/professorVoices.ts';

test('Freud and Kernberg have distinct dedicated voices, not the generic male voice', () => {
  const freud = resolveProfessorVoice('male', 'freud');
  const kernberg = resolveProfessorVoice('male', 'kernberg');
  assert.ok(freud);
  assert.ok(kernberg);
  assert.notEqual(freud, kernberg);
  assert.notEqual(freud, resolveProfessorVoice('male'));
  assert.notEqual(kernberg, resolveProfessorVoice('male'));
});

test('named thinker voices do not change when the lecture voice preference changes', () => {
  for (const persona of ['freud', 'kernberg']) {
    assert.equal(resolveProfessorVoice('female', persona), resolveProfessorVoice('male', persona));
  }
});

test('existing generic professor choices are unchanged', () => {
  assert.equal(resolveProfessorVoice(), process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb');
  assert.equal(resolveProfessorVoice('female'), process.env.ELEVENLABS_FEMALE_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
  assert.equal(resolveProfessorVoice('female', 'professor'), resolveProfessorVoice('female'));
});
