/**
 * stream-body.ts — hand a large response over in pieces.
 *
 * On Vercel an ordinary function response stops at 4.5 MB; a streamed one has
 * no such limit. A clinic's backup passes 4.5 MB within its first year or so.
 */
export function streamBody(
  data: string | Uint8Array,
  chunkSize = 256 * 1024,
): ReadableStream<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}
