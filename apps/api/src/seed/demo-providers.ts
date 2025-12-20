// ============================================================
// SYNAPSE Demo Providers
// Seed data for testing and demo purposes
// ============================================================

import { ProviderRegistry } from '@synapse/core';

export function seedDemoProviders(providerRegistry: ProviderRegistry): void {
  console.log('Seeding demo providers...');

  // Weather Bot 1 - High reputation, fast
  const weatherBot1 = providerRegistry.registerProvider({
    name: 'WeatherBot Pro',
    description: 'Premium weather data provider with global coverage and high accuracy',
    capabilities: ['weather.current', 'weather.forecast'],
    endpoint: 'http://localhost:3010/api',
    address: '0xWeatherBot1'
  });
  // Boost reputation
  for (let i = 0; i < 50; i++) {
    providerRegistry.recordJobSuccess(weatherBot1.id, 500, 0.01);
  }

  // Weather Bot 2 - Medium reputation
  const weatherBot2 = providerRegistry.registerProvider({
    name: 'QuickWeather',
    description: 'Fast and affordable weather data',
    capabilities: ['weather.current'],
    endpoint: 'http://localhost:3011/api',
    address: '0xWeatherBot2'
  });
  for (let i = 0; i < 20; i++) {
    providerRegistry.recordJobSuccess(weatherBot2.id, 800, 0.008);
  }

  // Crypto Bot 1 - High reputation
  const cryptoBot1 = providerRegistry.registerProvider({
    name: 'CryptoOracle',
    description: 'Real-time cryptocurrency prices from multiple exchanges',
    capabilities: ['crypto.price', 'crypto.history'],
    endpoint: 'http://localhost:3020/api',
    address: '0xCryptoBot1'
  });
  for (let i = 0; i < 100; i++) {
    providerRegistry.recordJobSuccess(cryptoBot1.id, 300, 0.005);
  }

  // Crypto Bot 2 - Lower reputation, cheaper
  const cryptoBot2 = providerRegistry.registerProvider({
    name: 'PriceFeeder',
    description: 'Budget-friendly crypto price feeds',
    capabilities: ['crypto.price'],
    endpoint: 'http://localhost:3021/api',
    address: '0xCryptoBot2'
  });
  for (let i = 0; i < 10; i++) {
    providerRegistry.recordJobSuccess(cryptoBot2.id, 1000, 0.003);
  }

  // News Bot 1 - Premium
  const newsBot1 = providerRegistry.registerProvider({
    name: 'NewsAggregator Pro',
    description: 'Comprehensive news aggregation from 100+ sources',
    capabilities: ['news.latest', 'news.search'],
    endpoint: 'http://localhost:3030/api',
    address: '0xNewsBot1'
  });
  for (let i = 0; i < 30; i++) {
    providerRegistry.recordJobSuccess(newsBot1.id, 1200, 0.02);
  }

  // News Bot 2 - Basic
  const newsBot2 = providerRegistry.registerProvider({
    name: 'HeadlineBot',
    description: 'Quick headline scraping service',
    capabilities: ['news.latest'],
    endpoint: 'http://localhost:3031/api',
    address: '0xNewsBot2'
  });
  for (let i = 0; i < 15; i++) {
    providerRegistry.recordJobSuccess(newsBot2.id, 2000, 0.01);
  }

  // AI Bot - Text processing
  const aiBot = providerRegistry.registerProvider({
    name: 'TextGenius',
    description: 'AI-powered text analysis and summarization',
    capabilities: ['ai.summarize', 'ai.translate', 'compute.text'],
    endpoint: 'http://localhost:3040/api',
    address: '0xAIBot1'
  });
  for (let i = 0; i < 25; i++) {
    providerRegistry.recordJobSuccess(aiBot.id, 2500, 0.05);
  }

  const stats = providerRegistry.getStats();
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                 DEMO PROVIDERS SEEDED                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Providers: ${stats.total.toString().padEnd(42)}║
║  Online: ${stats.online.toString().padEnd(52)}║
║  Capabilities:                                                ║
${Object.entries(stats.capabilityCounts).map(([cap, count]) =>
  `║    - ${cap}: ${count} providers`.padEnd(63) + '║'
).join('\n')}
╚═══════════════════════════════════════════════════════════════╝
  `);
}
