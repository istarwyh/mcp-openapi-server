import { parseOpenAPISpec } from '../src/openapi-parser';
import * as fs from 'fs';
import * as path from 'path';

describe('parseOpenAPISpec', () => {
  it('should correctly parse OpenAPI spec and return expected tools', async () => {
    // Load test case
    const testCase = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'tests', 'fixtures', 'openai-test-case.json'),
        'utf-8'
      )
    );

    // Parse the input OpenAPI spec
    const result = await parseOpenAPISpec(testCase.input);
    
    // Convert Map to array format for comparison
    const toolsArray = Array.from(result.values());
    const resultObj = { tools: toolsArray };

    // Compare with expected output
    expect(resultObj).toEqual(testCase.expected);
  });
});
