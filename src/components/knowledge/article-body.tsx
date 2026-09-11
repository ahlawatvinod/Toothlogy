/**
 * An article's text, rendered by React from plain text — never as HTML. A
 * blank line separates blocks; a block starting "## " is a heading (the rest
 * of the block, if any, a paragraph); a block of "- " lines is a list.
 */

import { Fragment } from 'react';

export function ArticleBody({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="tl-stack">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        if (lines[0]!.startsWith('## ')) {
          const rest = lines.slice(1).join(' ');
          return (
            <Fragment key={i}>
              <h2>{lines[0]!.slice(3)}</h2>
              {rest ? <p style={{ margin: 0 }}>{rest}</p> : null}
            </Fragment>
          );
        }
        return (
          <p key={i} style={{ margin: 0 }}>
            {lines.join(' ')}
          </p>
        );
      })}
    </div>
  );
}
