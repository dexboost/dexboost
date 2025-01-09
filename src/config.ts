export const config = {
  settings: {
    db_name_tracker: "src/data/main.db", // Sqlite Database location
    hunter_timeout: 5000, // Seconds until hunter requests new data from endpoints
    api_get_timeout: 10000, // Timeout for API requests
    chains_to_track: ["solana"], // Chains that the hunter should track tokens for.
    dex_to_track: "raydium", // Dexs that the hunter should track tokens for.
    ignore_pump_fun: false,
    min_boost_amount: 10,
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
