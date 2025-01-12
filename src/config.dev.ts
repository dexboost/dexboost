export const config = {
    endpoints: [
        {
            name: "boosts-latest",
            url: "https://api.dexscreener.com/token-boosts/latest/v1",
            platform: "dexscreener"
        },
        {
            name: "get-token",
            url: "https://api.dexscreener.com/latest/dex/tokens/",
            platform: "dexscreener"
        }
    ],
    settings: {
        api_get_timeout: 10000,
        db_name_tracker: 'database.db',
        frontend_url: 'http://localhost:5173',
        api_url: 'http://localhost:3000',
        dex_to_track: "raydium",
        min_boost_amount: 10,
        chains_to_track: ["solana"],
        ignore_pump_fun: false,
        hunter_timeout: 5000
    },
    axios: {
        get_timeout: 10000
    },
    rug_check: {
        enabled: true,
        verbose_log: false
    }
};