import dotenv from "dotenv"; // zero-dependency module that loads environment variables from a .env
import axios from "axios";
import { DateTime } from "luxon";
import { config } from "./config"; // Configuration parameters for our hunter
import { RugResponse, TokenResponseType, detailedTokenResponseType, dexEndpoint, updatedDetailedTokenType } from "./types";
import { selectTokenBoostAmounts, upsertTokenBoost, deleteOldTokens } from "./db";
import { red, green, yellow, blue } from 'colorette';
import { getRugCheck } from "./transactions";
import nodeHtmlToImage from 'node-html-to-image';
import path from 'path';
import fs from 'fs';

// Load environment variables from the .env file
dotenv.config();

// Helper function to get data from endpoints
export async function getEndpointData(url: string): Promise<false | any> {
  try {
    // console.log(`Fetching data from endpoint: ${url}`);
    const response = await axios.get(url, {
      timeout: config.axios?.get_timeout || 10000,
    });

    if (!response.data) {
      // console.log('No data received from endpoint');
      return false;
    }

    // If this is the boosts endpoint, validate the data structure
    if (url.includes('token-boosts/latest')) {
      if (!Array.isArray(response.data)) {
        // console.log('Invalid data format from boosts endpoint - expected array');
        return false;
      }
      
      // Validate each token has required fields
      const validTokens = response.data.filter(token => 
        token.tokenAddress && 
        token.chainId && 
        typeof token.amount === 'number' && 
        typeof token.totalAmount === 'number'
      );

      console.log(`Received ${validTokens.length} valid tokens from endpoint`);
      return validTokens;
    }

    // console.log(`Received data from endpoint: ${url}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching endpoint data:', error);
    return false;
  }
}

// Start requesting data
let firstRun = true;
export async function startHunter() {
  // First run logic
  if (firstRun) {
    console.clear();
    console.log("Started. Waiting for tokens...");
    
    // Delete old tokens on startup
    await deleteOldTokens();
  }

  async function main() {
    try {
      // Get endpoints
      const endpoints = config.endpoints || [];
      
      // Verify if endpoints are provided
      if (endpoints.length === 0) {
        console.log('No endpoints configured. Please check your configuration.');
        return;
      }

      // Delete old tokens every hour
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      if (currentMinute === 0) { // Run at the start of every hour
        await deleteOldTokens();
      }

      console.log(`\nChecking ${endpoints.length} endpoints for new tokens...`);

      // Loop through the endpoints
      await Promise.all(
        endpoints.map(async (endpoint) => {
          const ep: dexEndpoint = endpoint;
          const endpointName = ep.name;
          const endpointUrl = ep.url;
          const endpointPlatform = ep.platform;
          const chains = config.settings.chains_to_track;

          // Handle Dexscreener
          if (endpointPlatform === "dexscreener") {
            // Check latest token boosts on dexscreener
            if (endpointName === "boosts-latest") {
              // Get latest boosts
              const data = await getEndpointData(endpointUrl);

              // Check if data was received
              if (!data) {
                console.log(`🚫 No new token boosts received.`);
                return;
              }

              // Add tokens database
              const tokensData: TokenResponseType[] = data;
              console.log(`Processing ${tokensData.length} tokens...`);

              // Loop through tokens
              for (const token of tokensData) {
                try {
                  // Verify chain
                  if (!chains.includes(token.chainId.toLowerCase())) {
                    // console.log(`Skipping token ${token.tokenAddress} - chain ${token.chainId} not tracked`);
                    continue;
                  }

                  // Only process PumpFun tokens
                  if (!token.tokenAddress.trim().toLowerCase().endsWith("pump")) {
                    // console.log(`Skipping non-PumpFun token ${token.tokenAddress}`);
                    continue;
                  }

                  // Get the current boost amounts for this token
                  const returnedAmounts = await selectTokenBoostAmounts(token.tokenAddress);

                  // Check if new information was provided
                  if (!returnedAmounts || returnedAmounts.amountTotal !== token.totalAmount) {
                    console.log(`\nProcessing new token: ${token.tokenAddress}`);
                    
                    // Get latest token information
                    const endpoint = endpoints.find((e) => e.platform === endpointPlatform && e.name === "get-token");
                    const getTokenEndpointUrl = endpoint ? endpoint.url : null;
                    if (!getTokenEndpointUrl) {
                      console.log('No token info endpoint configured');
                      continue;
                    }

                    // Request latest token information
                    const newTokenData = await getEndpointData(`${getTokenEndpointUrl}${token.tokenAddress}`);
                    if (!newTokenData) {
                      console.log('Failed to get token details');
                      continue;
                    }

                    // Check if token has reached 500 boosts
                 

                    // Extract information from returned data
                    const detailedTokensData: detailedTokenResponseType = newTokenData;
                    const dexPair = detailedTokensData.pairs.find((pair) => pair.dexId === config.settings.dex_to_track);
                    if (!dexPair) {
                      console.log('No matching DEX pair found');
                      continue;
                    }

                    const tokenName = dexPair.baseToken.name || token.tokenAddress;
                    const tokenSymbol = dexPair.baseToken.symbol || "N/A";

                    // Filter and combine social links
                    const websites = dexPair.info?.websites || [];
                    const socials = dexPair.info?.socials || [];
                    const filteredLinks = [
                        // Only include the first website if it exists and has http
                        ...(websites.filter(link => link?.url?.includes('http')).slice(0, 1).map(link => ({ type: 'website', url: link.url })) || []),
                        // Only include telegram and twitter links
                        ...(socials.filter(link => {
                            const type = link?.type?.toLowerCase() || '';
                            const url = link?.url?.toLowerCase() || '';
                            return (type === 'telegram' || type === 'twitter' ||
                                   url.includes('t.me') || url.includes('twitter.com'));
                        }).map(link => {
                            // Normalize the type
                            let type = link.type?.toLowerCase() || '';
                            if (type !== 'telegram' && type !== 'twitter') {
                                if (link.url.includes('t.me')) type = 'telegram';
                                if (link.url.includes('twitter.com')) type = 'twitter';
                            }
                            return { type, url: link.url };
                        }) || [])
                    ];

                    // Create record with latest token information
                    const updatedTokenProfile: updatedDetailedTokenType = {
                      url: token.url || '',
                      chainId: token.chainId || '',
                      tokenAddress: token.tokenAddress,
                      icon: token.icon || '',
                      header: dexPair.info?.header || '',
                      openGraph: dexPair.info?.openGraph || '',
                      description: token.description || '',
                      links: filteredLinks,
                      amount: token.amount || 0,
                      totalAmount: token.totalAmount || 0,
                      pairsAvailable: detailedTokensData.pairs.length || 0,
                      dexPair: config.settings.dex_to_track,
                      currentPrice: dexPair.priceUsd ? parseFloat(dexPair.priceUsd) : 0,
                      liquidity: dexPair.liquidity?.usd || 0,
                      marketCap: dexPair.marketCap || 0,
                      pairCreatedAt: dexPair.pairCreatedAt || 0,
                      tokenName: tokenName || '',
                      tokenSymbol: tokenSymbol || '',
                      volume24h: dexPair.volume?.h24 || 0,
                      volume6h: dexPair.volume?.h6 || 0,
                      volume1h: dexPair.volume?.h1 || 0
                    };

                    if (token.amount === 500) {
                      console.log(`🎉 Token ${updatedTokenProfile.tokenName} has reached 500 boosts! Generating celebration image...`);
                      await generateCelebrationImage(token, newTokenData);
                    }

                    // Add or update Record
                    const x = await upsertTokenBoost(updatedTokenProfile);

                    // Confirm
                    if (x && token.totalAmount && config.settings.min_boost_amount <= token.totalAmount) {
                      // Check if Golden Ticker
                      let goldenTicker = "⚡";
                      let goldenTickerColor = blue;
                      if (updatedTokenProfile.totalAmount && updatedTokenProfile.totalAmount > 499) {
                        goldenTicker = "🔥";
                        goldenTickerColor = yellow;
                      }

                      // Check socials
                      let socialsIcon = "🔴";
                      let socialsColor = blue;
                      let socialLenght = 0;
                      if (updatedTokenProfile.links && updatedTokenProfile.links.length > 0) {
                        socialsIcon = "🟢";
                        socialsColor = green;
                        socialLenght = updatedTokenProfile.links.length;
                      }

                      // Handle pumpfun
                      let pumpfunIcon = "🔴";
                      let isPumpFun = "No";
                      if (updatedTokenProfile.tokenAddress.trim().toLowerCase().endsWith("pump")) {
                        pumpfunIcon = "🟢";
                        isPumpFun = "Yes";
                      }

                      // Handle Rugcheck
                      let rugCheckResults: string[] = [];
                      if (config.rug_check.enabled) {
                        const res = await getRugCheck(updatedTokenProfile.tokenAddress);
                        if (res) {
                          const rugResults: RugResponse = res;
                          const rugRisks = rugResults.risks;

                          // Add risks
                          if (rugRisks.length !== 0) {
                            const dangerLevelIcons = {
                              danger: "🔴",
                              warn: "🟡",
                            };

                            rugCheckResults = rugRisks.map((risk) => {
                              const icon = dangerLevelIcons[risk.level as keyof typeof dangerLevelIcons] || "⚪";
                              return `${icon} ${risk.name}: ${risk.description}`;
                            });
                          }
                          // Add no risks
                          if (rugRisks.length === 0) {
                            const newRiskString = `🟢 No risks found`;
                            rugCheckResults.push(newRiskString);
                          }
                        }
                      }

                      // Check age
                      const timeAgo = updatedTokenProfile.pairCreatedAt ? DateTime.fromMillis(updatedTokenProfile.pairCreatedAt).toRelative() : "N/A";

                      // Console Log
                      console.log("\n\n[ Boost Information ]");
                      console.log(`✅ ${updatedTokenProfile.amount} boosts added for ${updatedTokenProfile.tokenName} (${updatedTokenProfile.tokenSymbol}).`);
                      console.log(goldenTickerColor(`${goldenTicker} Boost Amount: ${updatedTokenProfile.totalAmount}`));
                      console.log("[ Token Information ]");
                      console.log(socialsColor(`${socialsIcon} This token has ${socialLenght} socials.`));
                      console.log(
                        `🕝 This token pair was created ${timeAgo} and has ${updatedTokenProfile.pairsAvailable} pairs available including ${updatedTokenProfile.dexPair}`
                      );
                      console.log(`🤑 Current Price: $${updatedTokenProfile.currentPrice}`);
                      console.log(`📦 Current Mkt Cap: $${updatedTokenProfile.marketCap}`);
                      console.log(`💦 Current Liquidity: $${updatedTokenProfile.liquidity}`);
                      console.log(`🚀 Pumpfun token: ${pumpfunIcon} ${isPumpFun}`);
                      if (rugCheckResults.length !== 0) {
                        console.log("[ Rugcheck Result   ]");
                        rugCheckResults.forEach((risk) => {
                          console.log(risk);
                        });
                      }
                      console.log("[ Checkout Token    ]");
                      console.log(`👀 View on Dex https://dexscreener.com/${updatedTokenProfile.chainId}/${updatedTokenProfile.tokenAddress}`);
                      console.log(`🟣 Buy via Nova https://t.me/TradeonNovaBot?start=r-digitalbenjamins-${updatedTokenProfile.tokenAddress}`);
                      console.log(`👽 Buy via GMGN https://gmgn.ai/sol/token/${updatedTokenProfile.tokenAddress}`);
                    }
                  }
                } catch (error) {
                  console.error(`Error processing token ${token.tokenAddress}:`, error);
                }
              }
            }
          }
        })
      );
    } catch (error) {
      console.error('Error in hunter main loop:', error);
    }

    firstRun = false;
    setTimeout(main, config.settings.hunter_timeout); // Call main again after timeout
  }

  // Start the hunter loop
  await main().catch((error) => {
    console.error('Fatal error in hunter:', error);
  });
}

async function generateCelebrationImage(token: TokenResponseType, tokenDetails: detailedTokenResponseType) {
  try {
    // Create images directory if it doesn't exist
    const imagesDir = path.join(__dirname, '..', 'public', 'celebrations');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const dexPair = tokenDetails.pairs.find((pair) => pair.dexId === config.settings.dex_to_track);
    if (!dexPair) return;

    const html = `
      <html>
        <head>
          <style>
            :root {
              --background: 0 0% 3.9%;
              --foreground: 0 0% 98%;
              --card: 0 0% 3.9%;
              --card-foreground: 0 0% 98%;
              --popover: 0 0% 3.9%;
              --popover-foreground: 0 0% 98%;
              --primary: 0 72.2% 50.6%;
              --primary-foreground: 0 85.7% 97.3%;
              --secondary: 0 0% 14.9%;
              --secondary-foreground: 0 0% 98%;
              --muted: 0 0% 14.9%;
              --muted-foreground: 0 0% 63.9%;
              --accent: 0 0% 14.9%;
              --accent-foreground: 0 0% 98%;
              --destructive: 0 62.8% 30.6%;
              --destructive-foreground: 0 0% 98%;
              --border: 0 0% 14.9%;
              --input: 0 0% 14.9%;
              --ring: 0 72.2% 50.6%;
              --radius: 0.5rem;
            }
            body {
              width: 1200px;
              height: 630px;
              margin: 0;
              padding: 40px;
              background: hsl(var(--background));
              color: hsl(var(--foreground));
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
            }
            .container {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 24px;
              background: hsl(var(--card));
              padding: 48px;
              border-radius: var(--radius);
              border: 1px solid hsl(var(--border));
            }
            .icon {
              width: 128px;
              height: 128px;
              border-radius: 50%;
              object-fit: cover;
              border: 4px solid hsl(var(--primary));
            }
            .token-name {
              font-size: 64px;
              font-weight: 700;
              color: hsl(var(--foreground));
              margin: 0;
            }
            .boost-count {
              font-size: 96px;
              font-weight: 800;
              color: hsl(var(--primary));
              margin: 0;
              line-height: 1;
            }
            .stats {
              font-size: 24px;
              color: hsl(var(--muted-foreground));
              display: flex;
              gap: 32px;
            }
            .stat {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .stat-value {
              color: hsl(var(--foreground));
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${token.icon ? `<img src="${token.icon}" class="icon" alt="Token Icon" />` : ''}
            <div class="token-name">${dexPair.baseToken.name || token.tokenAddress}</div>
            <div class="">Has been boosted by</div>
            <div class="boost-count">⚡ 500 BOOSTS</div>
            <div class="stats">
              <div class="stat">
                <span>Market Cap</span>
                <span class="stat-value">$${formatNumber(dexPair.marketCap || 0)}</span>
              </div>
              <div class="stat">
                <span>24h Volume</span>
                <span class="stat-value">$${formatNumber(dexPair.volume?.h24 || 0)}</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const outputPath = path.join(imagesDir, `${token.tokenAddress}-500.png`);
    await nodeHtmlToImage({
      output: outputPath,
      html,
      quality: 100,
      type: 'png',
      puppeteerArgs: {
        executablePath: '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--headless',
          '--disable-extensions'
        ],
      },
      waitUntil: 'networkidle0'
    });

    console.log(`🎨 Generated celebration image for ${dexPair.baseToken.name} at ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating celebration image:', error);
    return null;
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}
