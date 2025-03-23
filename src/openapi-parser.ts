import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { OpenAPIV3 } from "openapi-types";
import { log } from "./logger.js";
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';

type Tool = {
  name: string;
  description: string;
  inputSchema: OpenAPIV3.SchemaObject;
  metadata: Metadata;
};

type Metadata = {
  method: string;
  originalPath: string;
  parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[];
  requestBodySchema?: OpenAPIV3.SchemaObject;
};

type ToolMap = Map<string, Tool>;

const createEmptySchema = (): OpenAPIV3.SchemaObject => ({
  type: "object",
  properties: {},
  required: []
});

const isReferenceObject = (obj: any): obj is OpenAPIV3.ReferenceObject => 
  obj && '$ref' in obj;

const addPropertyToSchema = (
  schema: OpenAPIV3.SchemaObject,
  propName: string,
  propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  isRequired: boolean
) => {
  if (isReferenceObject(propSchema)) return;

  if (!schema.properties) schema.properties = {};
  schema.properties[propName] = propSchema;

  if (isRequired) {
    if (!schema.required) schema.required = [];
    if (!schema.required.includes(propName)) {
      schema.required.push(propName);
    }
  }
};

const addRequestBodyToSchema = (
  requestBodySchema: OpenAPIV3.SchemaObject,
  inputSchema: OpenAPIV3.SchemaObject
): void => {
  if (!requestBodySchema.properties) return;

  Object.entries(requestBodySchema.properties).forEach(([propName, propSchema]) => {
    addPropertyToSchema(
      inputSchema,
      propName,
      propSchema,
      requestBodySchema.required?.includes(propName) || false
    );
  });
};

const createParameterSchema = (param: OpenAPIV3.ParameterObject): OpenAPIV3.SchemaObject => {
  const paramSchema = param.schema;
  if (!paramSchema || isReferenceObject(paramSchema)) return {} as OpenAPIV3.SchemaObject;

  const paramType = paramSchema.type || 'string';
  return paramType === 'array'
    ? {
        type: 'array',
        description: param.description || `${param.name} parameter`,
      } as OpenAPIV3.ArraySchemaObject
    : {
        type: paramType as OpenAPIV3.NonArraySchemaObjectType,
        description: param.description || `${param.name} parameter`,
      };
};

const addParametersToSchema = (
  parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[],
  schema: OpenAPIV3.SchemaObject
): void => {
  parameters.forEach(param => {
    if (!isReferenceObject(param)) {
      const paramSchema = createParameterSchema(param);
      addPropertyToSchema(schema, param.name, paramSchema, param.required || false);
    }
  });
};

const cleanupSchema = (schema: OpenAPIV3.SchemaObject): void => {
  if (Object.keys(schema.properties || {}).length === 0) delete schema.properties;
  if ((schema.required || []).length === 0) delete schema.required;
};

const readSpecFile = async (filePath: string): Promise<string> => {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`OpenAPI spec file not found: ${resolvedPath}`);
  }
  return await readFile(resolvedPath, "utf8");
};

const parseSpecContent = async (content: string, filePath: string): Promise<OpenAPIV3.Document> => {
  const isYaml = filePath.toLowerCase().endsWith(".yaml") || filePath.toLowerCase().endsWith(".yml");
  
  if (isYaml) {
    return yaml.load(content) as OpenAPIV3.Document;
  }
  return JSON.parse(content);
};

interface CacheEntry {
  content: OpenAPIV3.Document;
  timestamp: number;
  etag?: string;
}

const CACHE_DIR = '.cache';
const CACHE_TTL = 3600 * 1000; // 1 hour in milliseconds

const ensureCacheDir = async () => {
  const cacheDir = path.join(process.cwd(), CACHE_DIR);
  await mkdir(cacheDir, { recursive: true });
  return cacheDir;
};

const getCacheKey = (url: string): string => {
  return crypto.createHash('md5').update(url).digest('hex');
};

const getCachedSpec = async (url: string): Promise<CacheEntry | null> => {
  try {
    const cacheDir = await ensureCacheDir();
    const cacheKey = getCacheKey(url);
    const cachePath = path.join(cacheDir, `${cacheKey}.json`);
    
    const content = await readFile(cachePath, 'utf8');
    const entry: CacheEntry = JSON.parse(content);
    
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      log('Cache entry expired');
      return null;
    }
    
    return entry;
  } catch (error) {
    log(`Cache miss: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const setCachedSpec = async (url: string, content: OpenAPIV3.Document, etag?: string): Promise<void> => {
  try {
    const cacheDir = await ensureCacheDir();
    const cacheKey = getCacheKey(url);
    const cachePath = path.join(cacheDir, `${cacheKey}.json`);
    
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      etag
    };
    
    await writeFile(cachePath, JSON.stringify(entry, null, 2));
    log(`Cache updated for ${url}`);
  } catch (error) {
    log(`Failed to update cache: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const isErrorWithMessage = (error: unknown): error is { message: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
};

const toErrorWithMessage = (maybeError: unknown): Error => {
  if (isErrorWithMessage(maybeError)) return new Error(maybeError.message);
  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // fallback in case there's an error stringifying the maybeError
    // like with circular references for example
    return new Error(String(maybeError));
  }
};

const fetchWithRetry = async (url: string, cachedEtag?: string): Promise<{ content: OpenAPIV3.Document; etag?: string }> => {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      log(`Attempt ${i + 1}/${maxRetries}: Fetching from ${url}`);
      const headers: Record<string, string> = {
        'Accept': 'application/json, application/yaml, text/plain',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache'
      };

      if (cachedEtag) {
        headers['If-None-Match'] = cachedEtag;
      }

      const response = await fetch(url, { headers });

      // 304 Not Modified means we should use the cached version
      if (response.status === 304 && cachedEtag) {
        throw new Error('USE_CACHED_VERSION');
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      if (!text) {
        throw new Error(`Empty response from ${url}`);
      }
      log(`Response text length: ${text.length}`);
      const content = await parseContent(text);
      return { 
        content, 
        etag: response.headers.get('etag') || undefined 
      };
    } catch (maybeError: unknown) {
      const error = toErrorWithMessage(maybeError);
      lastError = error;
      log(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}`);
      
      // If we should use cached version, propagate this special error
      if (error.message === 'USE_CACHED_VERSION') {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to fetch OpenAPI spec after ${maxRetries} retries: ${lastError?.message}`);
};

const parseContent = async (content: string): Promise<OpenAPIV3.Document> => {
  try {
    const json = JSON.parse(content);
    log('Successfully parsed response as JSON');
    return json;
  } catch (jsonError) {
    log('Failed to parse as JSON, trying YAML');
    try {
      const yamlContent = yaml.load(content) as OpenAPIV3.Document;
      log('Successfully parsed response as YAML');
      return yamlContent;
    } catch (yamlError) {
      throw new Error('Failed to parse response as either JSON or YAML');
    }
  }
};

const loadOpenAPISpec = async (specPath: string | OpenAPIV3.Document): Promise<OpenAPIV3.Document> => {
  if (typeof specPath !== 'string') {
    return specPath;
  }

  log(`Loading OpenAPI spec from: ${specPath}`);

  try {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const cached = await getCachedSpec(specPath);
      try {
        const { content, etag } = await fetchWithRetry(specPath, cached?.etag);
        await setCachedSpec(specPath, content, etag);
        return content;
      } catch (maybeError: unknown) {
        const error = toErrorWithMessage(maybeError);
        if (error.message === 'USE_CACHED_VERSION' && cached) {
          log('Using cached version (304 Not Modified)');
          return cached.content;
        }
        throw error;
      }
    }

    const content = await readFile(specPath, 'utf8');
    log(`OpenAPI spec file read successfully, length: ${content.length} bytes`);

    if (specPath.endsWith('.yaml') || specPath.endsWith('.yml')) {
      return yaml.load(content) as OpenAPIV3.Document;
    }

    return JSON.parse(content);
  } catch (maybeError: unknown) {
    const error = toErrorWithMessage(maybeError);
    log(`Failed to load OpenAPI spec: ${error.message}`);
    throw error;
  }
};

const validateSpec = (spec: OpenAPIV3.Document): void => {
  if (!spec) throw new Error(`OpenAPI spec is undefined or null`);
  if (!spec.paths) throw new Error(`OpenAPI spec does not contain paths property`);
  log(`Successfully loaded OpenAPI spec with ${Object.keys(spec.paths).length} paths`);
};

const createToolsFromOperation = (
  path: string,
  method: string,
  operation: OpenAPIV3.OperationObject
): Tool[] => {
  const metadata: Metadata = {
    method: method.toUpperCase(),
    originalPath: path,
    parameters: operation.parameters || []
  };

  const inputSchema = createEmptySchema();

  if (operation.parameters) {
    addParametersToSchema(operation.parameters, inputSchema);
  }

  if (operation.requestBody && !isReferenceObject(operation.requestBody)) {
    const contentType = Object.keys(operation.requestBody.content)[0];
    const schema = operation.requestBody.content[contentType]?.schema;
    
    if (schema && !isReferenceObject(schema)) {
      metadata.requestBodySchema = schema;
      addRequestBodyToSchema(schema, inputSchema);
    }
  }

  cleanupSchema(inputSchema);

  const summaries = (operation.summary || '').split('|').map(s => s.trim());
  const descriptions = (operation.description || '').split('|').map(d => d.trim());
  const maxLength = Math.max(summaries.length, descriptions.length);

  return Array.from({ length: maxLength }, (_, index) => {
    const name = summaries[index % summaries.length] || `${method} ${path}`;
    const description = descriptions[index % descriptions.length] || name;
    return {
      name,
      description,
      inputSchema,
      metadata
    };
  });
};

const parseOpenAPISpec = async (specPath: string | OpenAPIV3.Document): Promise<ToolMap> => {
  try {
    const spec = await loadOpenAPISpec(specPath);
    validateSpec(spec);

    log(`Successfully loaded OpenAPI spec with ${Object.keys(spec.paths || {}).length} paths`);

    const tools = new Map<string, Tool>();

    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem || isReferenceObject(pathItem)) return;

      log(`Processing path: ${path}`);
      log(`pathItem: ${JSON.stringify(pathItem)}`);

      Object.entries(pathItem).forEach(([method, operation]) => {
        if (!operation || method === 'parameters' || isReferenceObject(operation)) return;

        const newTools = createToolsFromOperation(path, method, operation as OpenAPIV3.OperationObject);
        newTools.forEach(tool => {
          log(`Registered tool: ${tool.name} for ${tool.metadata.method} ${tool.metadata.originalPath} with inputSchema`);
          tools.set(tool.name, tool);
        });
      });
    });

    return tools;
  } catch (error) {
    const typedError = error instanceof Error ? error : new Error(String(error));
    const message = typedError.message;
    log(`Failed to parse OpenAPI spec: ${message}`);
    throw typedError;
  }
};

export { parseOpenAPISpec };
