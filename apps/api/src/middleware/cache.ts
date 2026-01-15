// ============================================================
// API Response Cache Middleware
// In-memory caching with TTL for frequently accessed endpoints
// ============================================================

import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  // Default TTL in milliseconds
  defaultTTL: number;
  // Maximum number of entries in cache
  maxEntries: number;
  // Whether to include query params in cache key
  includeQuery: boolean;
}

const defaultConfig: CacheConfig = {
  defaultTTL: 5000, // 5 seconds
  maxEntries: 1000,
  includeQuery: true,
};

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private hits: number = 0;
  private misses: number = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // Generate cache key from request
  private generateKey(req: Request): string {
    let key = `${req.method}:${req.path}`;
    if (this.config.includeQuery && Object.keys(req.query).length > 0) {
      const sortedQuery = Object.keys(req.query)
        .sort()
        .map((k) => `${k}=${req.query[k]}`)
        .join('&');
      key += `?${sortedQuery}`;
    }
    return key;
  }

  // Get cached response
  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  // Set cached response
  set(key: string, data: unknown, ttl?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.defaultTTL,
    });
  }

  // Invalidate cache entry
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  // Invalidate all entries matching a pattern
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  // Clear all cache entries
  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  // Create middleware for specific TTL
  middleware(ttl?: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const key = this.generateKey(req);
      const cached = this.get(key);

      if (cached) {
        // Add cache header for debugging
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }

      // Store original json function
      const originalJson = res.json.bind(res);

      // Override json to cache the response
      res.json = (body: unknown) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.set(key, body, ttl);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    };
  }
}

// Create singleton cache instance
export const apiCache = new ResponseCache({
  defaultTTL: 5000, // 5 seconds default
  maxEntries: 500,
  includeQuery: true,
});

// Pre-configured middleware for common use cases
export const cacheMiddleware = {
  // Very short cache for real-time data (1 second)
  realtime: apiCache.middleware(1000),

  // Short cache for frequently changing data (5 seconds)
  short: apiCache.middleware(5000),

  // Medium cache for moderately changing data (30 seconds)
  medium: apiCache.middleware(30000),

  // Long cache for relatively static data (5 minutes)
  long: apiCache.middleware(300000),

  // Custom TTL
  custom: (ttlMs: number) => apiCache.middleware(ttlMs),
};

// Cache invalidation helpers
export const cacheInvalidation = {
  // Invalidate provider-related caches
  providers: () => apiCache.invalidatePattern(/providers/i),

  // Invalidate intent-related caches
  intents: () => apiCache.invalidatePattern(/intents/i),

  // Invalidate network stats
  networkStats: () => apiCache.invalidate('GET:/api/network/stats'),

  // Invalidate DeFi caches
  defi: () => apiCache.invalidatePattern(/defi/i),

  // Invalidate all
  all: () => apiCache.clear(),
};

// Middleware to add cache stats endpoint
export function cacheStatsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/api/cache/stats') {
    return res.json({
      success: true,
      data: apiCache.getStats(),
      timestamp: Date.now(),
    });
  }
  next();
}

export default apiCache;
