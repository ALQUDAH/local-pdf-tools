/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Extracts headings, paragraphs and list items from HTML in a single linear pass.
// Uses a real HTML tokenizer (htmlparser2) instead of a regular expression, so unclosed
// or malformed tags can't make the work grow with the square of the input size.

import { Parser } from 'htmlparser2';

export type BlockTag = 'h1' | 'h2' | 'p' | 'li';
export interface TextBlock {
  tag: BlockTag;
  text: string;
}

const BLOCKS = new Set<string>(['h1', 'h2', 'p', 'li']);
const SKIP = new Set<string>(['script', 'style', 'noscript', 'template', 'head']);

export function extractTextBlocks(html: string): { blocks: TextBlock[]; plainText: string } {
  const blocks: TextBlock[] = [];
  let current: { tag: BlockTag; parts: string[] } | null = null;
  let skipDepth = 0;
  const plain: string[] = [];

  const flush = () => {
    if (!current) return;
    const text = current.parts.join('').replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ tag: current.tag, text });
    current = null;
  };

  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP.has(name)) skipDepth++;
        if (BLOCKS.has(name)) {
          // A paragraph inside a list item stays part of that item (keeps the bullet)
          if (name === 'p' && current?.tag === 'li') return;
          flush(); // a new block implicitly ends the previous one (e.g. unclosed <p>)
          current = { tag: name as BlockTag, parts: [] };
        }
      },
      ontext(text) {
        if (skipDepth > 0) return;
        plain.push(text);
        current?.parts.push(text);
      },
      onclosetag(name) {
        if (SKIP.has(name) && skipDepth > 0) skipDepth--;
        if (BLOCKS.has(name) && current?.tag === name) flush();
      },
    },
    { decodeEntities: true, lowerCaseTags: true }
  );
  parser.write(html);
  parser.end();
  flush();

  return { blocks, plainText: plain.join(' ').replace(/\s+/g, ' ').trim() };
}
