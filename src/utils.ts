// utils.ts

/**
 * Extracts all text within `"text": "` quotes from a given string.
 * @param input - The input string to search.
 * @returns An array of strings containing the extracted text.
 */
export function extractTextFromQuotes(input: string): string[] {
  const regex = /"text":\s*"([^"]*)"/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

export function extractIteratorFromQuotes(input: string): string[] {
    const regex = /"iterator":\s*"([^"]*)"/g;
    const matches = [];
    let match;
  
    while ((match = regex.exec(input)) !== null) {
      matches.push(match[1]);
    }
  
    return matches;
  }
  