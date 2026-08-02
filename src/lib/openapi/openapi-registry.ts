// ============================================================
// Gen3ia — Registre OpenAPI pour génération automatique de documentation
// Convertit les schémas Zod en spécifications OpenAPI 3.1
// ============================================================

import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('openapi-registry');

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OpenApiRoute {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  /** Schéma Zod pour les paramètres de query */
  querySchema?: z.ZodTypeAny;
  /** Schéma Zod pour les paramètres de path */
  pathSchema?: z.ZodTypeAny;
  /** Schéma Zod pour le body de la requête */
  bodySchema?: z.ZodTypeAny;
  /** Schéma Zod pour la réponse en succès */
  responseSchema?: z.ZodTypeAny;
  /** Code de statut de la réponse */
  responseStatus?: number;
  /** Nécessite une authentification */
  requiresAuth?: boolean;
  /** Rôles autorisés */
  roles?: string[];
  /** Exemples de requête */
  examples?: Record<string, unknown>[];
  /** Headers requis */
  headers?: string[];
  /** Rate limiting */
  rateLimit?: { max: number; windowMs: number };
  /** Déprécié */
  deprecated?: boolean;
}

class OpenApiRegistry {
  private routes: Map<string, OpenApiRoute> = new Map();
  private schemas: Map<string, z.ZodTypeAny> = new Map();
  private info: {
    title: string;
    version: string;
    description: string;
    contact?: { name: string; email: string; url: string };
  };

  constructor() {
    this.info = {
      title: 'Gen3ia API',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '0.9.0',
      description: `API REST de Gen3ia — Agent Operating System.
      
Authentification :
- **Bearer Token** : Header \`Authorization: Bearer <access_token>\`
- **API Key** : Header \`X-API-Key: <api_key>\`

Les tokens d'accès expirent après 15 minutes. Utilisez \`POST /api/auth/refresh\` pour obtenir un nouveau token.`,
      contact: {
        name: 'Gen3ia Team',
        email: 'support@gen3ia.ai',
        url: 'https://gen3ia.ai',
      },
    };
  }

  /**
   * Enregistre une route API avec ses métadonnées OpenAPI
   */
  register(route: OpenApiRoute): void {
    const key = `${route.method}:${route.path}`;
    if (this.routes.has(key)) {
      log.warn('Route déjà enregistrée, remplacement', { key });
    }
    this.routes.set(key, route);
  }

  /**
   * Enregistre un schéma réutilisable (Zod → OpenAPI component)
   */
  registerSchema(name: string, schema: z.ZodTypeAny): void {
    this.schemas.set(name, schema);
    log.info('Schéma enregistré', { name });
  }

  /**
   * Convertit un type Zod en type OpenAPI
   */
  private zodToOpenApiType(
    schema: z.ZodTypeAny,
    visited = new Set<string>()
  ): Record<string, unknown> {
    if (schema instanceof z.ZodString) {
      const result: Record<string, unknown> = { type: 'string' };
      if (schema.minLength !== null && schema.minLength !== undefined) {
        const minCheck = schema._def.checks?.find((c: any) => c.kind === 'min');
        if (minCheck) result.minLength = minCheck.value;
      }
      if (schema.maxLength !== null && schema.maxLength !== undefined) {
        const maxCheck = schema._def.checks?.find((c: any) => c.kind === 'max');
        if (maxCheck) result.maxLength = maxCheck.value;
      }
      // Regex patterns
      const regexCheck = schema._def.checks?.find((c: any) => c.kind === 'regex');
      if (regexCheck) result.pattern = regexCheck.regex.source;
      // Email
      if (schema._def.checks?.some((c: any) => c.kind === 'email')) {
        result.format = 'email';
      }
      return result;
    }

    if (schema instanceof z.ZodNumber) {
      const result: Record<string, unknown> = { type: 'number' };
      const minCheck = schema._def.checks?.find((c: any) => c.kind === 'min');
      if (minCheck) result.minimum = minCheck.value;
      const maxCheck = schema._def.checks?.find((c: any) => c.kind === 'max');
      if (maxCheck) result.maximum = maxCheck.value;
      if (schema._def.checks?.some((c: any) => c.kind === 'int')) {
        result.type = 'integer';
      }
      return result;
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema._def.values,
      };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToOpenApiType(schema._def.type, visited),
      };
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema._def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodValue = value as z.ZodTypeAny;
        properties[key] = this.zodToOpenApiType(zodValue, visited);

        // Ajouter la description si présente
        const description = zodValue.description;
        if (description) {
          (properties[key] as Record<string, unknown>).description = description;
        }

        // Vérifier si le champ est optionnel
        if (
          !(zodValue instanceof z.ZodOptional) &&
          !(zodValue instanceof z.ZodNullable) &&
          !(zodValue._def?.innerType?.isOptional)
        ) {
          // Vérifier si il y a un default
          const hasDefault = zodValue._def?.defaultValue !== undefined;
          if (!hasDefault) {
            required.push(key);
          }
        }
      }

      const result: Record<string, unknown> = {
        type: 'object',
        properties,
      };
      if (required.length > 0) result.required = required;
      return result;
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToOpenApiType(schema._def.innerType, visited);
    }

    if (schema instanceof z.ZodNullable) {
      const inner = this.zodToOpenApiType(schema._def.innerType, visited) as Record<string, unknown>;
      inner.nullable = true;
      return inner;
    }

    if (schema instanceof z.ZodDefault) {
      const inner = this.zodToOpenApiType(schema._def.innerType, visited) as Record<string, unknown>;
      inner.default = schema._def.defaultValue();
      return inner;
    }

    if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
      const options = schema._def.options?.map((opt: z.ZodTypeAny) => this.zodToOpenApiType(opt, visited)) || [];
      return { oneOf: options };
    }

    if (schema instanceof z.ZodRecord) {
      return {
        type: 'object',
        additionalProperties: this.zodToOpenApiType(schema._def.valueType, visited),
      };
    }

    if (schema instanceof z.ZodLiteral) {
      return { type: typeof schema._def.value, enum: [schema._def.value] };
    }

    // Fallback
    return { type: 'string', description: 'Type non déterminé' };
  }

  /**
   * Génère la spécification OpenAPI 3.1 complète
   */
  generateSpec(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    const schemas: Record<string, unknown> = {};

    // Convertir les schémas enregistrés
    for (const [name, schema] of this.schemas) {
      schemas[name] = this.zodToOpenApiType(schema);
    }

    // Construire les paths
    for (const [, route] of this.routes) {
      if (!paths[route.path]) {
        paths[route.path] = {};
      }

      const method = route.method.toLowerCase();
      const operation: Record<string, unknown> = {
        summary: route.summary,
        tags: route.tags,
        parameters: [],
        responses: {},
      };

      if (route.description) operation.description = route.description;
      if (route.deprecated) operation.deprecated = true;

      // Paramètres de path
      if (route.pathSchema) {
        const shape = (route.pathSchema as z.ZodObject<any>).shape;
        for (const [key, value] of Object.entries(shape)) {
          (operation.parameters as unknown[]).push({
            name: key,
            in: 'path',
            required: true,
            schema: this.zodToOpenApiType(value as z.ZodTypeAny),
          });
        }
      }

      // Paramètres de query
      if (route.querySchema) {
        const shape = (route.querySchema as z.ZodObject<any>).shape;
        for (const [key, value] of Object.entries(shape)) {
          (operation.parameters as unknown[]).push({
            name: key,
            in: 'query',
            required: !((value as z.ZodTypeAny) instanceof z.ZodOptional),
            schema: this.zodToOpenApiType(value as z.ZodTypeAny),
          });
        }
      }

      // Headers requis
      if (route.headers) {
        for (const header of route.headers) {
          (operation.parameters as unknown[]).push({
            name: header,
            in: 'header',
            required: header === 'Authorization',
            schema: { type: 'string' },
          });
        }
      }

      // Auth
      if (route.requiresAuth) {
        (operation.parameters as unknown[]).push({
          name: 'Authorization',
          in: 'header',
          required: true,
          description: 'Bearer <access_token> ou X-API-Key <api_key>',
          schema: { type: 'string' },
          example: 'Bearer eyJhbGciOiJIUzI1NiJ9...',
        });
      }

      // Body de la requête
      if (route.bodySchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: this.zodToOpenApiType(route.bodySchema),
            },
          },
        };

        // Exemples
        if (route.examples && route.examples.length > 0) {
          (operation.requestBody as Record<string, any>).content['application/json'].examples = {
            example1: {
              summary: 'Exemple de requête',
              value: route.examples[0],
            },
          };
        }
      }

      // Réponse succès
      const statusCode = String(route.responseStatus || 200);
      const responseObj: Record<string, unknown> = {
        description: 'Succès',
      };

      if (route.responseSchema) {
        responseObj.content = {
          'application/json': {
            schema: this.zodToOpenApiType(route.responseSchema),
          },
        };
      }

      (operation.responses as Record<string, unknown>)[statusCode] = responseObj;

      // Réponses d'erreur standard
      const errorResponses: Record<string, string> = {
        '400': 'Données invalides',
        '401': 'Non authentifié',
        '403': 'Permissions insuffisantes',
        '404': 'Ressource introuvable',
        '429': 'Trop de requêtes',
        '500': 'Erreur interne',
      };

      for (const [code, desc] of Object.entries(errorResponses)) {
        if (!operation.responses[code]) {
          (operation.responses as Record<string, unknown>)[code] = {
            description: desc,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', description: desc },
                    details: { type: 'array', items: { type: 'object' }, description: 'Détails de validation' },
                  },
                },
              },
            },
          };
        }
      }

      paths[route.path][method] = operation;
    }

    return {
      openapi: '3.1.0',
      info: this.info,
      servers: [
        {
          url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          description: 'Serveur API Gen3ia',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Access token JWT (15 min). Obtenu via POST /api/auth/login',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Clé API persistante. Créée dans le panneau développeur',
          },
        },
        schemas,
      },
      security: [
        { bearerAuth: [] },
        { apiKey: [] },
      ],
      paths,
      tags: [
        { name: 'Auth', description: 'Authentification et gestion des sessions' },
        { name: 'Agents', description: 'Exécution et gestion des agents IA' },
        { name: 'Workflows', description: 'Automatisation multi-étapes' },
        { name: 'Crédits', description: 'Système de crédits et abonnements' },
        { name: 'Paiements', description: 'Paiements mobile (SebPay, SubPay, Stripe)' },
        { name: 'Webhooks', description: 'Webhooks entrants et sortants' },
        { name: 'Terminal', description: 'Terminal intelligent' },
        { name: 'Mémoire', description: 'Mémoire vectorielle et RAG' },
        { name: 'Marketplace', description: 'Marketplace d agents' },
        { name: 'Admin', description: 'Administration du système' },
        { name: 'Monitoring', description: 'Métriques et observabilité' },
      ],
      externalDocs: {
        description: 'Documentation complète',
        url: 'https://docs.gen3ia.ai',
      },
    };
  }

  /**
   * Retourne les routes enregistrées (pour débogage)
   */
  getRoutes(): { method: HttpMethod; path: string; summary: string; tags: string[] }[] {
    return Array.from(this.routes.values()).map(r => ({
      method: r.method,
      path: r.path,
      summary: r.summary,
      tags: r.tags,
    }));
  }
}

// Singleton
export const openApiRegistry = new OpenApiRegistry();
