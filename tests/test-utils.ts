import { expect } from 'chai';
import { extractTextFromQuotes } from '../src/utils';

describe('extractTextFromQuotes', () => {
  it('should extract text within "text": "..." quotes', () => {
    const input = '{"text": "Hello, World!", "otherKey": "value"}';
    const result = extractTextFromQuotes(input);
    expect(result).to.deep.equal(['Hello, World!']);
  });

  it('should extract multiple texts within "text": "..." quotes', () => {
    const input = '{"text": "First"}, {"text": "Second"}, {"text": "Third"}';
    const result = extractTextFromQuotes(input);
    expect(result).to.deep.equal(['First', 'Second', 'Third']);
  });

  it('should handle no matches', () => {
    const input = '{"key": "value"}';
    const result = extractTextFromQuotes(input);
    expect(result).to.deep.equal([]);
  });

  it('should handle escaped quotes within text', () => {
    const input = '{"text": "He said, \\"Hello!\\""}';
    const result = extractTextFromQuotes(input);
    expect(result).to.deep.equal(['He said, \\"Hello!\\"']);
  });

  it('should handle multiple lines', () => {
    const input = `
      {
        "text": "Line one",
        "otherKey": "value"
      },
      {
        "text": "Line two"
      }
    `;
    const result = extractTextFromQuotes(input);
    expect(result).to.deep.equal(['Line one', 'Line two']);
  });
});
