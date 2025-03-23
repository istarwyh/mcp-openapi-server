import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { OpenAPIV3 } from "openapi-types";
import { log } from "./logger.js";

type Tool = {
  name: string;
  description: string;
  inputSchema: OpenAPIV3.SchemaObject;
  metadata?: Metadata;
};

type Metadata = {
  method: string;
  originalPath: string;
  requestBodySchema?: OpenAPIV3.SchemaObject;
  parameters?: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[];
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
    const yaml = await import("js-yaml");
    return yaml.load(content) as OpenAPIV3.Document;
  }
  return JSON.parse(content);
};

const loadOpenAPISpec = async (specPath: string | OpenAPIV3.Document): Promise<OpenAPIV3.Document> => {
  if (typeof specPath === "string") {
    try {
      log(`Loading OpenAPI spec from: ${specPath}`);
      const content = await readSpecFile(specPath);
      log(`OpenAPI spec file read successfully, length: ${content.length} bytes`);
      const parsed = await parseSpecContent(content, specPath);
      log(`OpenAPI spec parsed successfully`);
      return parsed;
    } catch (error) {
      const message = `Failed to load OpenAPI spec: ${error instanceof Error ? error.message : error}`;
      log(message);
      throw new Error(message);
    }
  }
  
  if (specPath) {
    log(`Using provided OpenAPI spec object`);
    return specPath;
  }
  
  throw new Error(`No OpenAPI spec provided`);
};

const validateSpec = (spec: OpenAPIV3.Document): void => {
  if (!spec) throw new Error(`OpenAPI spec is undefined or null`);
  if (!spec.paths) throw new Error(`OpenAPI spec does not contain paths property`);
  log(`Successfully loaded OpenAPI spec with ${Object.keys(spec.paths).length} paths`);
};

const createToolFromOperation = (
  path: string,
  method: string,
  operation: OpenAPIV3.OperationObject
): Tool => {
  const metadata: Metadata = {
    method: method.toUpperCase(),
    originalPath: path,
    parameters: operation.parameters
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

  return {
    name: operation.summary || operation.operationId || `${method} ${path}`,
    description: operation.description || operation.summary || `${method} ${path}`,
    inputSchema,
    metadata
  };
};

const registerTools = (spec: OpenAPIV3.Document, tools: ToolMap): void => {
  Object.entries(spec.paths).forEach(([path, pathItem]) => {
    if (!pathItem || isReferenceObject(pathItem)) return;
    
    log(`Processing path: ${path}`);
    log(`pathItem: ${JSON.stringify(pathItem)}`);

    Object.entries(pathItem).forEach(([method, operation]) => {
      if (method === 'parameters' || isReferenceObject(operation) || !operation) return;

      const tool = createToolFromOperation(path, method, operation as OpenAPIV3.OperationObject);
      log(`Registered tool: ${tool.name} for ${method.toUpperCase()} ${path} with inputSchema`);
      tools.set(tool.name, tool);
    });
  });
};

export const parseOpenAPISpec = async (
  specPath: string | OpenAPIV3.Document
): Promise<ToolMap> => {
  try {
    log(`Starting to parse OpenAPI spec...`);
    const spec = await loadOpenAPISpec(specPath);
    validateSpec(spec);
    
    const tools: ToolMap = new Map();
    registerTools(spec, tools);
    return tools;
  } catch (error) {
    const message = `Failed to parse OpenAPI spec: ${error instanceof Error ? error.message : error}`;
    log(message);
    throw new Error(message);
  }
};
