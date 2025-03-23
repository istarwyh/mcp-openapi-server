import { parseOpenAPISpec } from '../src/openapi-parser';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('axios');

describe('parseOpenAPISpec', () => {
  it('should correctly parse OpenAPI spec and return expected tools', async () => {
    const testCase = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'tests', 'fixtures', 'openai-test-case.json'),
        'utf-8'
      )
    );
    const result = await parseOpenAPISpec(testCase.input);
    const toolsArray = Array.from(result.values());
    const resultObj = { tools: toolsArray };
    expect(resultObj).toEqual(testCase.expected);
  });
});

describe('parseOpenAPISpecFromWeb', () => {
  it('should correctly parse OpenAPI spec from web and return expected tools', async () => {
    const testCase = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'tests', 'fixtures', 'openai-test-case-web.json'),
        'utf-8'
      )
    );
    const result = await parseOpenAPISpec(testCase.input);
    const toolsArray = Array.from(result.values());
    const resultObj = { tools: toolsArray };
    expect(resultObj).toEqual(testCase.expected);
  });
});
