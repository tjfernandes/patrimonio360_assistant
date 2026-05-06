import type { ReactNode } from 'react'

interface MessageMarkdownProps {
  messageId: string
  text: string
}

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'unordered_list'; items: string[] }
  | { type: 'ordered_list'; items: string[] }

function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraphBuffer: string[] = []
  let unorderedBuffer: string[] = []
  let orderedBuffer: string[] = []

  const flushParagraph = () => {
    const text = paragraphBuffer.join(' ').trim()
    if (!text) {
      paragraphBuffer = []
      return
    }
    blocks.push({ type: 'paragraph', text })
    paragraphBuffer = []
  }

  const flushUnordered = () => {
    if (unorderedBuffer.length === 0) {
      return
    }
    blocks.push({ type: 'unordered_list', items: unorderedBuffer })
    unorderedBuffer = []
  }

  const flushOrdered = () => {
    if (orderedBuffer.length === 0) {
      return
    }
    blocks.push({ type: 'ordered_list', items: orderedBuffer })
    orderedBuffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushUnordered()
      flushOrdered()
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*•]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      flushOrdered()
      unorderedBuffer.push(unorderedMatch[1].trim())
      continue
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      flushUnordered()
      orderedBuffer.push(orderedMatch[1].trim())
      continue
    }

    flushUnordered()
    flushOrdered()
    paragraphBuffer.push(trimmed)
  }

  flushParagraph()
  flushUnordered()
  flushOrdered()

  return blocks
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let match = pattern.exec(text)
  let tokenIndex = 0

  while (match) {
    const [token] = match
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`} className="font-semibold text-[#241518]">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${tokenIndex}`}
          className="rounded-md bg-[#6d0b1b]/10 px-1 py-0.5 font-mono text-[0.84em] text-[#5a1724]"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(token)
    }

    cursor = match.index + token.length
    tokenIndex += 1
    match = pattern.exec(text)
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function MessageMarkdown({ messageId, text }: MessageMarkdownProps) {
  const blocks = parseMarkdownBlocks(text)

  return (
    <div className="space-y-2 text-md leading-relaxed text-[#341d22]">
      {blocks.map((block, index) => {
        if (block.type === 'unordered_list') {
          return (
            <ul key={`${messageId}-ul-${index}`} className="list-disc space-y-1.5 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${messageId}-ul-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `${messageId}-ul-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === 'ordered_list') {
          return (
            <ol key={`${messageId}-ol-${index}`} className="list-decimal space-y-1.5 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${messageId}-ol-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `${messageId}-ol-${index}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          )
        }

        return (
          <p key={`${messageId}-p-${index}`}>
            {renderInlineMarkdown(block.text, `${messageId}-p-${index}`)}
          </p>
        )
      })}
    </div>
  )
}

export default MessageMarkdown
