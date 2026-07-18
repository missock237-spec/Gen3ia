/**
 * OpenAPI Export — Genere une spec OpenAPI 3.0 depuis le code deploye
 */

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: { url: string; description: string }[];
  paths: Record<string, Record<string, OpenAPIPath>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

export interface OpenAPIPath {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: {
    name: string;
    in: 'query' | 'path' | 'header';
    required?: boolean;
    schema: { type: string };
  }[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: { type: string; properties?: Record<string, unknown> } }>;
  };
  responses: Record<string, { description: string; content?: Record<string, { schema: { type: string } }> }>;
  security?: Record<string, string[]>[];
}

/**
 * Detecte les schemas et endpoints a partir du code
 */
function analyzeCodeForAPI(code: string): {
  endpoints: { method: string; path: string; summary: string }[];
  schemas: Record<string, { properties: Record<string, { type: string }> }>;
} {
  const endpoints: { method: string; path: string; summary: string }[] = [];
  const schemas: Record<string, { properties: Record<string, { type: string }> }> = {};

  // Detecter les interfaces et types
  const interfaceRegex = /interface\s+(\w+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = interfaceRegex.exec(code)) !== null) {
    const name = m[1];
    const props: Record<string, { type: string }> = {};
    const lines = m[2].split('\n');
    for (const line of lines) {
      const propMatch = line.match(/\s*(\w+)\??\s*:\s*([\w\[\]|]+)/);
      if (propMatch) {
        let type = propMatch[2].replace('[]', '').toLowerCase();
        if (type === 'string') type = 'string';
        else if (type === 'number' || type === 'int') type = 'number';
        else if (type === 'boolean' || type === 'bool') type = 'boolean';
        else if (type === 'date') type = 'string';
        else type = 'string';
        props[propMatch[1]] = { type };
      }
    }
    if (Object.keys(props).length > 0) {
      schemas[name] = { properties: props };
    }
  }

  // Detecter les fonctions exportees
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((m = funcRegex.exec(code)) !== null) {
    const fnName = m[1];
    const method = fnName === 'GET' || fnName === 'POST' || fnName === 'PUT' || fnName === 'DELETE'
      ? fnName.toLowerCase() : 'post';
    endpoints.push({
      method,
      path: '/api/' + fnName.toLowerCase(),
      summary: 'Endpoint genere depuis la fonction ' + fnName,
    });
  }

  if (endpoints.length === 0) {
    endpoints.push({ method: 'get', path: '/api/data', summary: 'Endpoint par defaut' });
    endpoints.push({ method: 'post', path: '/api/data', summary: 'Creer une ressource' });
  }

  return { endpoints, schemas };
}

/**
 * Genere une spec OpenAPI complete
 */
export function generateOpenAPISpec(
  code: string,
  name: string,
  baseUrl: string,
  description?: string
): OpenAPISpec {
  const analysis = analyzeCodeForAPI(code);
  const paths: Record<string, Record<string, OpenAPIPath>> = {};

  for (const ep of analysis.endpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};

    const pathItem: OpenAPIPath = {
      summary: ep.summary,
      operationId: ep.method + ep.path.replace(/\//g, '_'),
      responses: {
        '200': { description: 'Succes', content: { 'application/json': { schema: { type: 'object' } } } },
        '400': { description: 'Requete invalide' },
        '500': { description: 'Erreur serveur' },
      },
      security: [{ ApiKeyAuth: [] }],
    };

    if (ep.method === 'get' || ep.method === 'delete') {
      pathItem.parameters = [
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'offset', in: 'query', schema: { type: 'integer' } },
      ];
    }

    if (ep.method === 'post' || ep.method === 'put') {
      pathItem.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: Object.keys(analysis.schemas).length > 0
                ? analysis.schemas[Object.keys(analysis.schemas)[0]]?.properties
                : {},
            },
          },
        },
      };
    }

    paths[ep.path][ep.method] = pathItem;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: name || 'Genova Deployed API',
      version: '1.0.0',
      description: description || 'API generee automatiquement depuis CodeStudio',
    },
    servers: [
      { url: baseUrl, description: 'Production' },
    ],
    paths,
    components: {
      schemas: analysis.schemas as Record<string, unknown>,
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
  };
}

/**
 * Retourne la spec au format JSON
 */
export function exportOpenAPIJson(spec: OpenAPISpec): string {
  return JSON.stringify(spec, null, 2);
}

/**
 * Retourne la spec au format YAML
 */
export function exportOpenAPIYaml(spec: OpenAPISpec): string {
  const lines: string[] = ['openapi: "3.0.3"', 'info:', '  title: ' + JSON.stringify(spec.info.title), '  version: ' + JSON.stringify(spec.info.version)];
  lines.push('paths:');
  for (const [path, methods] of Object.entries(spec.paths)) {
    lines.push('  ' + path + ':');
    for (const [method, details] of Object.entries(methods)) {
      lines.push('    ' + method + ':');
      lines.push('      summary: ' + JSON.stringify(details.summary || ''));
      lines.push('      responses:');
      lines.push('        "200":');
      lines.push('          description: Succes');
    }
  }
  return lines.join('\n');
}