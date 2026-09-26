/**
 * Minimal markdown -> HTML for AI-written lessons and notes. Output is
 * plain semantic markup (no inline styles); the look comes from the
 * `.lesson-prose` / `.md-content` classes in globals.css, so it follows
 * the theme.
 *
 * The input is untrusted (AI output, pasted text): everything is escaped
 * first, code is set aside before any other formatting runs, and links
 * are only kept for http(s) URLs.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SAFE_URL = /^https?:\/\/[^\s]+$/i;

function inline(text: string): string {
  // `code` first, so nothing inside it gets formatted.
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    // _italic_ only as a whole word, so snake_case identifiers survive
    .replace(/(^|\s)_([^_\s][^_]*?)_(?=\s|$|[.,;:!?)])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
      // The URL was HTML-escaped with the rest of the text; undo that just for the check.
      const raw = url.replace(/&amp;/g, '&');
      return SAFE_URL.test(raw) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const src = escapeHtml(md.replace(/\r\n?/g, '\n'));

  // Fenced code blocks, set aside whole.
  const blocks: string[] = [];
  const withoutFences = src.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code: string) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    return `\n\u0001${blocks.length - 1}\u0001\n`;
  });

  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br />')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const rawLine of withoutFences.split('\n')) {
    const line = rawLine.trim();
    const fence = line.match(/^\u0001(\d+)\u0001$/);
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (!line) {
      flushPara();
      flushList();
    } else if (fence) {
      flushPara();
      flushList();
      out.push(blocks[Number(fence[1])]);
    } else if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length <= 2 ? 3 : 4;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}
