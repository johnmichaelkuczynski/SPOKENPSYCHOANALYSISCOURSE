type CaptureContext = {
  context?: { state: string; close: () => Promise<void> } | null;
};

/** Cleanup may run from Stop, socket close, cancellation, and unmount. */
export async function closeCaptureAudioContext(capture: CaptureContext): Promise<void> {
  const context = capture.context;
  // Detach before awaiting, so concurrent cleanup cannot close it twice.
  capture.context = null;
  if (!context || context.state === 'closed') return;
  try {
    await context.close();
  } catch {
    // Browsers can reject close() asynchronously if another path already closed it.
    // Cleanup must not surface an unhandled rejection over the conversation UI.
  }
}
