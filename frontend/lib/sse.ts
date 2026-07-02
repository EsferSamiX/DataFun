export async function consumeSSE(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: { type: string; [key: string]: unknown }) => void,
  authHeader?: Record<string, string>
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`SSE request failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    let eventData = ""
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        eventData += line.slice(6)
      } else if (line === "" && eventData) {
        try {
          const parsed = JSON.parse(eventData)
          onEvent(parsed)
        } catch {
          // ignore parse errors
        }
        eventData = ""
      }
    }
  }
}
