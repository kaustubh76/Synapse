// ============================================================
// REAL TOOL PROVIDERS
// Fetches actual data from external APIs (no mocks)
// ============================================================

import { EventEmitter } from 'eventemitter3';

// -------------------- TYPES --------------------

export interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  wind: number;
  feelsLike?: number;
  pressure?: number;
  visibility?: number;
  timestamp: number;
  source: string;
}

export interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h?: number;
  marketCap?: number;
  high24h?: number;
  low24h?: number;
  timestamp: number;
  source: string;
}

export interface NewsArticle {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  author?: string;
}

export interface NewsData {
  articles: NewsArticle[];
  totalResults: number;
  query: string;
  timestamp: number;
  source: string;
}

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: string;
  latencyMs: number;
  timestamp: number;
}

interface RealToolEvents {
  'request:started': (tool: string, params: any) => void;
  'request:completed': (tool: string, result: ToolResult<any>) => void;
  'request:failed': (tool: string, error: string) => void;
}

// -------------------- WEATHER PROVIDER --------------------

class WeatherProvider extends EventEmitter<RealToolEvents> {
  private apiKey: string | undefined;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor() {
    super();
    this.apiKey = process.env.OPENWEATHERMAP_API_KEY;
  }

  async getCurrentWeather(city: string): Promise<ToolResult<WeatherData>> {
    const startTime = Date.now();
    this.emit('request:started', 'weather.current', { city });

    // If no API key, try free alternatives
    if (!this.apiKey) {
      return this.getFallbackWeather(city, startTime);
    }

    try {
      const url = `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const result: ToolResult<WeatherData> = {
        success: true,
        data: {
          city: data.name,
          temperature: Math.round(data.main.temp * 10) / 10,
          condition: data.weather[0]?.main || 'Unknown',
          humidity: data.main.humidity,
          wind: Math.round(data.wind.speed * 10) / 10,
          feelsLike: Math.round(data.main.feels_like * 10) / 10,
          pressure: data.main.pressure,
          visibility: data.visibility,
          timestamp: Date.now(),
          source: 'OpenWeatherMap',
        },
        source: 'OpenWeatherMap',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'weather.current', result);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.emit('request:failed', 'weather.current', errorMsg);

      // Fallback on error
      return this.getFallbackWeather(city, startTime);
    }
  }

  private async getFallbackWeather(city: string, startTime: number): Promise<ToolResult<WeatherData>> {
    // Try Open-Meteo (free, no API key required)
    try {
      // First get coordinates for the city
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
      const geoResponse = await fetch(geoUrl);
      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`City not found: ${city}`);
      }

      const { latitude, longitude, name } = geoData.results[0];

      // Get weather data
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature,surface_pressure`;
      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();

      const current = weatherData.current;
      const latencyMs = Date.now() - startTime;

      const weatherCodes: Record<number, string> = {
        0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
        45: 'Foggy', 48: 'Foggy', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
        61: 'Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy Snow',
        80: 'Rain Showers', 81: 'Rain Showers', 82: 'Heavy Showers',
        95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Severe Thunderstorm',
      };

      const result: ToolResult<WeatherData> = {
        success: true,
        data: {
          city: name,
          temperature: Math.round(current.temperature_2m * 10) / 10,
          condition: weatherCodes[current.weather_code] || 'Unknown',
          humidity: current.relative_humidity_2m,
          wind: Math.round(current.wind_speed_10m * 10) / 10,
          feelsLike: Math.round(current.apparent_temperature * 10) / 10,
          pressure: current.surface_pressure,
          timestamp: Date.now(),
          source: 'Open-Meteo',
        },
        source: 'Open-Meteo',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'weather.current', result);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Weather fetch failed: ${errorMsg}`,
        source: 'Open-Meteo',
        latencyMs,
        timestamp: Date.now(),
      };
    }
  }
}

// -------------------- CRYPTO PROVIDER --------------------

class CryptoProvider extends EventEmitter<RealToolEvents> {
  private apiKey: string | undefined;
  private baseUrl = 'https://api.coingecko.com/api/v3';

  constructor() {
    super();
    this.apiKey = process.env.COINGECKO_API_KEY;
  }

  private getSymbolId(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
      'AVAX': 'avalanche-2',
      'MATIC': 'matic-network',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'LTC': 'litecoin',
      'ETC': 'ethereum-classic',
      'XLM': 'stellar',
      'NEAR': 'near',
      'APT': 'aptos',
      'OP': 'optimism',
      'ARB': 'arbitrum',
      'BASE': 'base',
    };
    return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  async getPrice(symbol: string): Promise<ToolResult<CryptoData>> {
    const startTime = Date.now();
    this.emit('request:started', 'crypto.price', { symbol });

    const coinId = this.getSymbolId(symbol);

    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      const url = `${this.baseUrl}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        // Try simple price endpoint as fallback
        return this.getSimplePrice(symbol, startTime);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const result: ToolResult<CryptoData> = {
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          name: data.name,
          price: data.market_data.current_price.usd,
          change24h: Math.round(data.market_data.price_change_percentage_24h * 100) / 100,
          volume24h: data.market_data.total_volume.usd,
          marketCap: data.market_data.market_cap.usd,
          high24h: data.market_data.high_24h.usd,
          low24h: data.market_data.low_24h.usd,
          timestamp: Date.now(),
          source: 'CoinGecko',
        },
        source: 'CoinGecko',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'crypto.price', result);
      return result;
    } catch (error) {
      return this.getSimplePrice(symbol, startTime);
    }
  }

  private async getSimplePrice(symbol: string, startTime: number): Promise<ToolResult<CryptoData>> {
    const coinId = this.getSymbolId(symbol);

    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const coinData = data[coinId];
      const latencyMs = Date.now() - startTime;

      if (!coinData) {
        throw new Error(`Coin not found: ${symbol}`);
      }

      const result: ToolResult<CryptoData> = {
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          name: coinId,
          price: coinData.usd,
          change24h: Math.round((coinData.usd_24h_change || 0) * 100) / 100,
          volume24h: coinData.usd_24h_vol,
          marketCap: coinData.usd_market_cap,
          timestamp: Date.now(),
          source: 'CoinGecko',
        },
        source: 'CoinGecko',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'crypto.price', result);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.emit('request:failed', 'crypto.price', errorMsg);

      return {
        success: false,
        error: `Crypto price fetch failed: ${errorMsg}`,
        source: 'CoinGecko',
        latencyMs,
        timestamp: Date.now(),
      };
    }
  }
}

// -------------------- NEWS PROVIDER --------------------

class NewsProvider extends EventEmitter<RealToolEvents> {
  private apiKey: string | undefined;

  constructor() {
    super();
    this.apiKey = process.env.NEWS_API_KEY;
  }

  async getLatestNews(query?: string): Promise<ToolResult<NewsData>> {
    const startTime = Date.now();
    const searchQuery = query || 'technology';
    this.emit('request:started', 'news.latest', { query: searchQuery });

    // NewsAPI requires API key
    if (!this.apiKey) {
      return this.getFallbackNews(searchQuery, startTime);
    }

    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&sortBy=publishedAt&pageSize=10&apiKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`NewsAPI error: ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const result: ToolResult<NewsData> = {
        success: true,
        data: {
          articles: data.articles.map((a: any) => ({
            title: a.title,
            description: a.description,
            source: a.source.name,
            url: a.url,
            publishedAt: a.publishedAt,
            author: a.author,
          })),
          totalResults: data.totalResults,
          query: searchQuery,
          timestamp: Date.now(),
          source: 'NewsAPI',
        },
        source: 'NewsAPI',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'news.latest', result);
      return result;
    } catch (error) {
      return this.getFallbackNews(searchQuery, startTime);
    }
  }

  private async getFallbackNews(query: string, startTime: number): Promise<ToolResult<NewsData>> {
    // Use HackerNews API (free, no key required)
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HackerNews API error: ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const result: ToolResult<NewsData> = {
        success: true,
        data: {
          articles: data.hits.map((hit: any) => ({
            title: hit.title,
            description: hit.story_text || `Points: ${hit.points}, Comments: ${hit.num_comments}`,
            source: 'Hacker News',
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            publishedAt: hit.created_at,
            author: hit.author,
          })),
          totalResults: data.nbHits,
          query,
          timestamp: Date.now(),
          source: 'HackerNews',
        },
        source: 'HackerNews',
        latencyMs,
        timestamp: Date.now(),
      };

      this.emit('request:completed', 'news.latest', result);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.emit('request:failed', 'news.latest', errorMsg);

      return {
        success: false,
        error: `News fetch failed: ${errorMsg}`,
        source: 'HackerNews',
        latencyMs,
        timestamp: Date.now(),
      };
    }
  }
}

// -------------------- UNIFIED TOOL PROVIDER --------------------

export class RealToolProvider extends EventEmitter<RealToolEvents> {
  private weatherProvider: WeatherProvider;
  private cryptoProvider: CryptoProvider;
  private newsProvider: NewsProvider;

  constructor() {
    super();
    this.weatherProvider = new WeatherProvider();
    this.cryptoProvider = new CryptoProvider();
    this.newsProvider = new NewsProvider();

    // Forward events
    this.weatherProvider.on('request:started', (t, p) => this.emit('request:started', t, p));
    this.weatherProvider.on('request:completed', (t, r) => this.emit('request:completed', t, r));
    this.weatherProvider.on('request:failed', (t, e) => this.emit('request:failed', t, e));

    this.cryptoProvider.on('request:started', (t, p) => this.emit('request:started', t, p));
    this.cryptoProvider.on('request:completed', (t, r) => this.emit('request:completed', t, r));
    this.cryptoProvider.on('request:failed', (t, e) => this.emit('request:failed', t, e));

    this.newsProvider.on('request:started', (t, p) => this.emit('request:started', t, p));
    this.newsProvider.on('request:completed', (t, r) => this.emit('request:completed', t, r));
    this.newsProvider.on('request:failed', (t, e) => this.emit('request:failed', t, e));
  }

  async executeTool(toolName: string, params: any): Promise<ToolResult<any>> {
    console.log(`[RealToolProvider] Executing tool: ${toolName} with params:`, params);

    switch (toolName) {
      case 'weather.current':
        return this.weatherProvider.getCurrentWeather(params?.city || 'New York');

      case 'crypto.price':
        return this.cryptoProvider.getPrice(params?.symbol || 'BTC');

      case 'news.latest':
      case 'news.search':
        return this.newsProvider.getLatestNews(params?.query || params?.topic);

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          source: 'RealToolProvider',
          latencyMs: 0,
          timestamp: Date.now(),
        };
    }
  }

  // Direct access methods
  async getWeather(city: string): Promise<ToolResult<WeatherData>> {
    return this.weatherProvider.getCurrentWeather(city);
  }

  async getCryptoPrice(symbol: string): Promise<ToolResult<CryptoData>> {
    return this.cryptoProvider.getPrice(symbol);
  }

  async getNews(query?: string): Promise<ToolResult<NewsData>> {
    return this.newsProvider.getLatestNews(query);
  }
}

// -------------------- SINGLETON --------------------

let toolProviderInstance: RealToolProvider | null = null;

export function getRealToolProvider(): RealToolProvider {
  if (!toolProviderInstance) {
    toolProviderInstance = new RealToolProvider();
  }
  return toolProviderInstance;
}

export function resetRealToolProvider(): void {
  toolProviderInstance = null;
}
