/**
 * API Versioning & Deprecation Management
 * 
 * Provides:
 * - Multiple API versions (/api/v1/, /api/v2/)
 * - Deprecation warnings
 * - Migration guides
 * - Backward compatibility
 * - Version-specific middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export type ApiVersion = 'v1' | 'v2' | 'v3';

export interface ApiVersionInfo {
  version: ApiVersion;
  status: 'stable' | 'beta' | 'deprecated';
  deprecatedAt?: Date;
  sunsetsAt?: Date;
  releaseNotes?: string;
  migrationGuide?: string;
}

export const API_VERSIONS: Record<ApiVersion, ApiVersionInfo> = {
  v1: {
    version: 'v1',
    status: 'stable',
    releaseNotes: 'Initial stable release',
  },
  v2: {
    version: 'v2',
    status: 'stable',
    releaseNotes: 'Added enhanced authentication and rate limiting',
  },
  v3: {
    version: 'v3',
    status: 'beta',
    releaseNotes: 'New async API with WebSockets support',
    migrationGuide: 'See /docs/api-v3-migration.md',
  },
};

/**
 * Extract API version from URL path
 */
export function extractApiVersion(pathname: string): ApiVersion | null {
  const match = pathname.match(/\/api\/(v\d+)\//);
  return (match?.[1] as ApiVersion) || null;
}

/**
 * Check if version is deprecated
 */
export function isVersionDeprecated(version: ApiVersion): boolean {
  const info = API_VERSIONS[version];
  return info?.status === 'deprecated';
}

/**
 * Get deprecation header
 */
export function getDeprecationHeader(version: ApiVersion): string | null {
  const info = API_VERSIONS[version];
  if (!info || info.status !== 'deprecated') return null;

  let header = `deprecated="${version}"`;
  if (info.sunsetsAt) {
    header += `, sunset="${info.sunsetsAt.toUTCString()}"`;
  }
  if (info.migrationGuide) {
    header += `, link="<${info.migrationGuide}>; rel=\\"deprecation\\""`;
  }

  return header;
}

/**
 * Version-aware request handler wrapper
 */
export function withApiVersion(
  handler: (req: NextRequest, version: ApiVersion) => Promise<NextResponse>,
) {
  return async (req: NextRequest) => {
    const version = extractApiVersion(req.nextUrl.pathname);
    if (!version) {
      return NextResponse.json(
        { error: 'API version required (e.g., /api/v1/)' },
        { status: 400 },
      );
    }

    const versionInfo = API_VERSIONS[version];
    if (!versionInfo) {
      return NextResponse.json(
        { error: `Unknown API version: ${version}` },
        { status: 404 },
      );
    }

    try {
      const response = await handler(req, version);

      // Add version info headers
      response.headers.set('X-API-Version', version);
      response.headers.set('X-API-Status', versionInfo.status);

      // Add deprecation warnings
      if (isVersionDeprecated(version)) {
        const deprecationHeader = getDeprecationHeader(version);
        if (deprecationHeader) {
          response.headers.set('Deprecation', 'true');
          response.headers.set('Warning', deprecationHeader);
        }
        logger.warn('Deprecated API version used', {
          version,
          ip: req.headers.get('x-forwarded-for'),
          endpoint: req.nextUrl.pathname,
        });
      }

      return response;
    } catch (error) {
      logger.error('API handler error', { version, error });
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }
  };
}

/**
 * Version compatibility checker
 * Ensures old clients can still access data with necessary transformations
 */
export function transformResponseForVersion<T>(
  data: T,
  fromVersion: ApiVersion,
  toVersion: ApiVersion,
): T {
  // Add version-specific transformations here
  // Example: v1 doesn't have certain fields that v2+ do

  if (fromVersion === 'v1' && toVersion === 'v2') {
    // Transform v1 response to v2 format
  }

  return data;
}

/**
 * Generate API versioning documentation
 */
export function generateVersioningDocs(): string {
  const docs = [
    '# API Versioning',
    '',
    '## Current Versions',
    '',
  ];

  for (const [version, info] of Object.entries(API_VERSIONS)) {
    docs.push(`### ${version.toUpperCase()}`);
    docs.push(`- **Status**: ${info.status}`);
    if (info.releaseNotes) docs.push(`- **Release**: ${info.releaseNotes}`);
    if (info.sunsetsAt) docs.push(`- **Sunsets**: ${info.sunsetsAt.toUTCString()}`);
    if (info.migrationGuide) docs.push(`- **Migration**: ${info.migrationGuide}`);
    docs.push('');
  }

  docs.push('## Usage');
  docs.push('```bash');
  docs.push('# Use specific version');
  docs.push('curl https://api.gen3ia.com/api/v1/agents');
  docs.push('');
  docs.push('# Check version in response headers');
  docs.push('curl -i https://api.gen3ia.com/api/v1/agents');
  docs.push('```');

  return docs.join('\n');
}
