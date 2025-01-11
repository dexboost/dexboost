import { Config } from './types';

export const config: Config = {
    settings: {
        api_get_timeout: 10000,
        db_name_tracker: 'database.db',
        frontend_url: 'https://dexboost.xyz',
        api_url: 'https://api.dexboost.xyz',
        dex_to_track: 'raydium',
        min_boost_amount: 100,
        chains_to_track: ['solana'],
        ignore_pump_fun: false,
        hunter_timeout: 5000
    },
    bots: [
      {
        referral: "r-digitalbenjamins",
        username: "TradeonNovaBot",
        chain: "solana",
      },
    ],
    axios: {
      get_timeout: 10000, // Timeout for API requests
    },
    dex: {
      endpoints: [
        {
          platform: "dexscreener",
          name: "boosts-latest",
          url: "https://api.dexscreener.com/token-boosts/latest/v1",
        },
        {
          platform: "dexscreener",
          name: "get-token",
          url: "https://api.dexscreener.com/latest/dex/tokens/",
        },
      ],
    },
    rug_check: {
      enabled: true, // if set to false, the rugcheck will not be included in the response
      verbose_log: false,
    },
  };