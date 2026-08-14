/**
 * Compression Optimizer - Gzip + Brotli Support
 * 
 * Intelligently compresses responses to reduce bandwidth
 * by 60-80% while maintaining compatibility.
 */

import zlib from 'zlib';
import { createLogger } from '@/lib/logger';

const log = createLogger('compression-optimizer');

export interface CompressionResult {
  original: number;
  compressed: number;
  compression: string; // 'gzip' | 'brotli' | 'none'
  ratio: number;
  savedBytes: number;
}

class CompressionOptimizer {
  private compressionStats = {
    totalOriginalBytes: 0,
    totalCompressedBytes: 0,
    gzipCount: 0,
    brotliCount: 0,
    uncompressedCount: 0,
  };

  constructor() {
    log.info('compression_optimizer_initialized');
  }

  /**
   * Compress data with best algorithm
   */
  async compress(data: string | Buffer, acceptEncoding: string = ''): Promise<{
    data: Buffer;
    encoding: string;
    stats: CompressionResult;
  }> {
    const originalSize = Buffer.byteLength(data);

    // Choose best compression based on client support
    if (acceptEncoding.includes('br')) {
      return await this.compressBrotli(data, originalSize);
    } else if (acceptEncoding.includes('gzip')) {
      return await this.compressGzip(data, originalSize);
    } else {
      return {
        data: Buffer.from(data),
        encoding: 'identity',
        stats: {
          original: originalSize,
          compressed: originalSize,
          compression: 'none',
          ratio: 0,
          savedBytes: 0,
        },
      };
    }
  }

  /**
   * Gzip compression
   */
  private compressGzip(data: string | Buffer, originalSize: number): Promise<{
    data: Buffer;
    encoding: string;
    stats: CompressionResult;
  }> {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, { level: 6 }, (err, compressed) => {
        if (err) {
          log.warn('gzip_compression_failed', { error: err.message });
          resolve({
            data: Buffer.from(data),
            encoding: 'identity',
            stats: {
              original: originalSize,
              compressed: originalSize,
              compression: 'none',
              ratio: 0,
              savedBytes: 0,
            },
          });
          return;
        }

        const compressedSize = compressed.length;
        const ratio = (compressedSize / originalSize * 100).toFixed(1);
        const savedBytes = originalSize - compressedSize;

        this.compressionStats.totalOriginalBytes += originalSize;
        this.compressionStats.totalCompressedBytes += compressedSize;
        this.compressionStats.gzipCount++;

        log.info('gzip_compression_success', {
          originalSize,
          compressedSize,
          ratio: `${ratio}%`,
          savedBytes,
        });

        resolve({
          data: compressed,
          encoding: 'gzip',
          stats: {
            original: originalSize,
            compressed: compressedSize,
            compression: 'gzip',
            ratio: parseFloat(ratio),
            savedBytes,
          },
        });
      });
    });
  }

  /**
   * Brotli compression (better but slower)
   */
  private compressBrotli(data: string | Buffer, originalSize: number): Promise<{
    data: Buffer;
    encoding: string;
    stats: CompressionResult;
  }> {
    return new Promise((resolve, reject) => {
      // Brotli is available in Node.js 11.7.0+
      if (!zlib.createBrotliCompress) {
        return this.compressGzip(data, originalSize).then(resolve).catch(reject);
      }

      zlib.brotliCompress(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }, (err, compressed) => {
        if (err) {
          log.warn('brotli_compression_failed', { error: err.message });
          return this.compressGzip(data, originalSize).then(resolve).catch(reject);
        }

        const compressedSize = compressed.length;
        const ratio = (compressedSize / originalSize * 100).toFixed(1);
        const savedBytes = originalSize - compressedSize;

        this.compressionStats.totalOriginalBytes += originalSize;
        this.compressionStats.totalCompressedBytes += compressedSize;
        this.compressionStats.brotliCount++;

        log.info('brotli_compression_success', {
          originalSize,
          compressedSize,
          ratio: `${ratio}%`,
          savedBytes,
        });

        resolve({
          data: compressed,
          encoding: 'br',
          stats: {
            original: originalSize,
            compressed: compressedSize,
            compression: 'brotli',
            ratio: parseFloat(ratio),
            savedBytes,
          },
        });
      });
    });
  }

  /**
   * Get compression statistics
   */
  getStats() {
    const totalOriginal = this.compressionStats.totalOriginalBytes;
    const totalCompressed = this.compressionStats.totalCompressedBytes;
    const totalSaved = totalOriginal - totalCompressed;
    const avgRatio = totalOriginal > 0 ? (totalCompressed / totalOriginal * 100).toFixed(2) : '0';

    return {
      ...this.compressionStats,
      totalSaved,
      averageRatio: `${avgRatio}%`,
      bandwidthReduction: `${((1 - totalCompressed / totalOriginal) * 100).toFixed(2)}%`,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.compressionStats = {
      totalOriginalBytes: 0,
      totalCompressedBytes: 0,
      gzipCount: 0,
      brotliCount: 0,
      uncompressedCount: 0,
    };
  }
}

export const compressionOptimizer = new CompressionOptimizer();
