import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
export function renderMarkdown(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown, { async: false }), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'del']),
    allowedAttributes: { a: ['href', 'title'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });
}
