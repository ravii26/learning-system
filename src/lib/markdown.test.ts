import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('builds paragraphs, headings and lists', () => {
    const html = renderMarkdown('# Title\n\nFirst line\nsecond line\n\n- one\n- two\n\n1. a\n2. b');
    expect(html).toBe('<h3>Title</h3>\n<p>First line<br />second line</p>\n<ul><li>one</li><li>two</li></ul>\n<ol><li>a</li><li>b</li></ol>');
  });

  it('leaves code untouched by other formatting', () => {
    expect(renderMarkdown('Use `a*b*c` and `my_var_name`')).toBe('<p>Use <code>a*b*c</code> and <code>my_var_name</code></p>');
    const html = renderMarkdown('```js\nconst x = a * b * c; // **not bold**\n```');
    expect(html).toBe('<pre><code>const x = a * b * c; // **not bold**</code></pre>');
  });

  it('formats bold and italic but keeps snake_case identifiers', () => {
    expect(renderMarkdown('**bold** and *soft* and _also_ but snake_case_name')).toBe(
      '<p><strong>bold</strong> and <em>soft</em> and <em>also</em> but snake_case_name</p>'
    );
  });

  it('escapes HTML and never emits script or unsafe links', () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [y](https://ok.dev/a?b=1&c=2) [z](a" onmouseover="x)');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('onmouseover="');
    expect(html).toContain('<a href="https://ok.dev/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">y</a>');
  });

  it('is empty for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
