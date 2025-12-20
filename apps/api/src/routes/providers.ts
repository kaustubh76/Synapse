// ============================================================
// SYNAPSE API - Provider Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  ProviderRegistry,
  ProviderRegistration,
  ApiResponse,
  Provider
} from '@synapse/core';

// Validation schemas
const RegisterProviderSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  capabilities: z.array(z.string()).min(1),
  endpoint: z.string().url(),
  address: z.string().min(1)
});

const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  capabilities: z.array(z.string()).optional(),
  endpoint: z.string().url().optional()
});

export function setupProviderRoutes(
  app: Express,
  providerRegistry: ProviderRegistry,
  io: SocketIOServer
): void {
  const router = Router();

  // -------------------- REGISTER PROVIDER --------------------
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validation = RegisterProviderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid provider data',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const provider = providerRegistry.registerProvider(
        validation.data as ProviderRegistration
      );

      res.status(201).json({
        success: true,
        data: provider,
        timestamp: Date.now()
      } as ApiResponse<Provider>);
    } catch (error) {
      console.error('Error registering provider:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REGISTER_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to register provider'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- LIST PROVIDERS --------------------
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { capability, online } = req.query;

      let providers: Provider[];

      if (capability) {
        providers = providerRegistry.getProvidersByCapability(capability as string);
      } else if (online === 'true') {
        providers = providerRegistry.getOnlineProviders();
      } else {
        providers = providerRegistry.getAllProviders();
      }

      res.json({
        success: true,
        data: providers,
        timestamp: Date.now()
      } as ApiResponse<Provider[]>);
    } catch (error) {
      console.error('Error listing providers:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_PROVIDERS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list providers'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET PROVIDER --------------------
  router.get('/:providerId', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const provider = providerRegistry.getProvider(providerId);

      if (!provider) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `Provider ${providerId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: provider,
        timestamp: Date.now()
      } as ApiResponse<Provider>);
    } catch (error) {
      console.error('Error getting provider:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get provider'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET PROVIDER BY ADDRESS --------------------
  router.get('/address/:address', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const provider = providerRegistry.getProviderByAddress(address);

      if (!provider) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `Provider with address ${address} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: provider,
        timestamp: Date.now()
      } as ApiResponse<Provider>);
    } catch (error) {
      console.error('Error getting provider:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get provider'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- UPDATE PROVIDER --------------------
  router.patch('/:providerId', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const validation = UpdateProviderSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update data',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const provider = providerRegistry.getProvider(providerId);
      if (!provider) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `Provider ${providerId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      // Manual update since registry doesn't expose update method directly
      const updateData = validation.data;
      if (updateData.name) provider.name = updateData.name;
      if (updateData.description) provider.description = updateData.description;
      if (updateData.capabilities) provider.capabilities = updateData.capabilities;
      if (updateData.endpoint) provider.endpoint = updateData.endpoint;

      res.json({
        success: true,
        data: provider,
        timestamp: Date.now()
      } as ApiResponse<Provider>);
    } catch (error) {
      console.error('Error updating provider:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update provider'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- HEARTBEAT --------------------
  router.post('/:providerId/heartbeat', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;

      providerRegistry.heartbeat(providerId);

      res.json({
        success: true,
        data: { acknowledged: true },
        timestamp: Date.now()
      } as ApiResponse<{ acknowledged: boolean }>);
    } catch (error) {
      console.error('Error processing heartbeat:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEARTBEAT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to process heartbeat'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DISCOVERY --------------------
  router.get('/discover/:intentType', async (req: Request, res: Response) => {
    try {
      const { intentType } = req.params;
      const { minReputation, requireTEE } = req.query;

      const providers = providerRegistry.discoverProviders(intentType, {
        minReputation: minReputation ? parseFloat(minReputation as string) : undefined,
        requireTEE: requireTEE === 'true'
      });

      res.json({
        success: true,
        data: providers,
        timestamp: Date.now()
      } as ApiResponse<Provider[]>);
    } catch (error) {
      console.error('Error discovering providers:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DISCOVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to discover providers'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- STATS --------------------
  router.get('/stats/overview', async (req: Request, res: Response) => {
    try {
      const stats = providerRegistry.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      } as ApiResponse<typeof stats>);
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get stats'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DELETE PROVIDER --------------------
  router.delete('/:providerId', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;

      const success = providerRegistry.removeProvider(providerId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `Provider ${providerId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: { deleted: true, providerId },
        timestamp: Date.now()
      } as ApiResponse<{ deleted: boolean; providerId: string }>);
    } catch (error) {
      console.error('Error deleting provider:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete provider'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/providers', router);
}
