import test from "node:test";
import assert from "node:assert/strict";
import { readGeniusStream } from "../src/lib/geniusThinkers.ts";

function streamOf(...chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

test("Genius 101 stream joins tokens split across network chunks", async () => {
  const result = await readGeniusStream(streamOf(
    'data: {"content":"Fre', 'ud’s "}\r\n\r\ndata: {"content":"answer."}\n',
    '\ndata: [DONE]',
  ));
  assert.equal(result, "Freud’s answer.");
});

test("Genius 101 corrected content replaces earlier tokens", async () => {
  const result = await readGeniusStream(streamOf(
    'data: {"content":"First draft"}\n\ndata: {"reset_content":true,"content":"Corrected answer."}\n',
    'data: {"audit":{"ok":true}}\ndata: [DONE]\n',
  ));
  assert.equal(result, "Corrected answer.");
});

test("provider errors are not mistaken for a spoken answer", async () => {
  await assert.rejects(readGeniusStream(streamOf('data: {"error":"Unavailable"}\ndata: [DONE]\n')), /could not complete/);
});

test("empty and incomplete streams do not silently succeed", async () => {
  await assert.rejects(readGeniusStream(streamOf('data: [DONE]\n')), /no spoken answer/);
  await assert.rejects(readGeniusStream(streamOf('data: {"content":"Truncated"}\n')), /interrupted/);
});
