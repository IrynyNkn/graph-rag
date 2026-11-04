export async function collectText(parts: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const part of parts) {
    text += part;
  }
  return text;
}
