// Tokens Reponses
export interface TokenResponseType {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon: string;
  header: string;
  openGraph: string;
  description: string;
  links: {
    label?: string; // Optional as not all links have "label"
    type?: string; // Optional as not all links have "type"
    url: string;
  }[];
  totalAmount?: number;
  amount?: number;
}
export interface detailedTokenResponseType {
  schemaVersion: string;
  pairs: {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    labels?: string[];
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
      m5: { buys: number; sells: number };
      h1: { buys: number; sells: number };
      h6: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    priceChange: {
      m5: number;
      h1: number;
      h6: number;
      h24: number;
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info: {
      imageUrl: string;
      header: string;
      openGraph: string;
      websites: { label: string; url: string }[];
      socials: { type: string; url: string }[];
    };
    boosts: { active: number };
  }[];
}
export interface dexEndpoint {
  platform: string;
  name: string;
  url: string;
}
export interface boostAmounts {
  amount: number; // Represents an integer value for amount
  amountTotal: number; // Represents an integer value for amountTotal
}
export type Config = {
    settings: {
        api_get_timeout: number;
        db_name_tracker: string;
        frontend_url: string;
        api_url: string;
        dex_to_track: string;
        min_boost_amount: number;
        chains_to_track: string[];
        ignore_pump_fun: boolean;
        hunter_timeout: number;
    };
    dex: {
        [key: string]: {
            router: string;
            factory: string;
            weth: string;
            chain_id: string;
        };
    };
    endpoints: Array<{
        platform: string;
        name: string;
        url: string;
    }>;
    rug_check: {
        verbose_log: boolean;
        enabled: boolean;
    };
    axios?: {
        get_timeout: number;
    };
};
export interface updatedDetailedTokenType {
  tokenName: string;
  tokenAddress: string;
  url: string;
  chainId: string;
  icon: string;
  header: string;
  openGraph: string;
  description: string;
  marketCap: number;
  amount: number;
  totalAmount: number;
  pairsAvailable: number;
  dexPair: string;
  currentPrice: number;
  liquidity: number;
  pairCreatedAt: number;
  tokenSymbol: string;
  volume24h: number;
  volume6h: number;
  volume1h: number;
  links: Array<{ type: string; url: string; }>;
}
export interface RugResponse {
  tokenProgram: string;
  tokenType: string;
  risks: Array<{
    name: string;
    value: string;
    description: string;
    score: number;
    level: string;
  }>;
  score: number;
}
