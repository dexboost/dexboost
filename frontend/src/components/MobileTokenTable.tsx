import { useEffect, useState, useMemo, useRef, useReducer } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { useToast } from "./ui/use-toast";
import { formatNumber, getSocialIcon } from '../lib/utils';
import { TokenTableProps, Token } from '../lib/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

export function MobileTokenTable({
  tokens,
  setTokens,
  sortBy,
  setSortBy,
  searchQuery,
  setSearchQuery,
  isLoading,
  error,
  setError,
  votes,
  setVotes,
  userVotes,
  setUserVotes,
  userId,
}: TokenTableProps) {
  const [wsRetries, setWsRetries] = useState(0);
  const [isManualClose, setIsManualClose] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const maxRetries = 5;
  const { toast } = useToast();
  const nowRef = useRef(Date.now());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());

  // Force re-render helper
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  // Update debounced value after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Separate memoized filters for better performance
  const filteredTokens = useMemo(() => {
    if (!debouncedQuery) return tokens;
    const query = debouncedQuery.toLowerCase();
    
    // Create lookup arrays for faster searching
    const addressMatch = [];
    const nameMatch = [];
    const symbolMatch = [];
    
    for (const token of tokens) {
      const address = token.tokenAddress.toLowerCase();
      const name = token.tokenName.toLowerCase();
      const symbol = token.tokenSymbol.toLowerCase();
      
      if (address.includes(query)) {
        addressMatch.push(token);
      } else if (name.includes(query)) {
        nameMatch.push(token);
      } else if (symbol.includes(query)) {
        symbolMatch.push(token);
      }
    }
    
    // Combine matches in priority order
    return [...addressMatch, ...nameMatch, ...symbolMatch];
  }, [tokens, debouncedQuery]);

  // Cache vote scores to avoid recalculation
  const voteScores = useMemo(() => {
    if (sortBy !== 'votes') return null;
    const scores = new Map();
    for (const token of filteredTokens) {
      const tokenVotes = votes[token.tokenAddress] || { upvotes: 0, downvotes: 0 };
      scores.set(token.tokenAddress, tokenVotes.upvotes - tokenVotes.downvotes);
    }
    return scores;
  }, [filteredTokens, votes, sortBy]);

  // Separate memoized sorting with optimizations
  const filteredAndSortedTokens = useMemo(() => {
    const now = nowRef.current;
    const pinnedTokens = [];
    const unpinnedTokens = [];

    // Split tokens into pinned and unpinned for faster sorting
    for (const token of filteredTokens) {
      if (token.pinnedUntil > now) {
        pinnedTokens.push(token);
      } else {
        unpinnedTokens.push(token);
      }
    }

    // Sort function with cached vote scores
    const sortTokens = (tokens: Token[]) => {
      return tokens.sort((a: Token, b: Token) => {
        if (sortBy === 'time') {
          return b.boosted - a.boosted;
        } else if (sortBy === 'votes' && voteScores) {
          const aScore = voteScores.get(a.tokenAddress) || 0;
          const bScore = voteScores.get(b.tokenAddress) || 0;
          return bScore === aScore 
            ? b.totalAmount - a.totalAmount 
            : bScore - aScore;
        } else {
          return b.totalAmount === a.totalAmount 
            ? b.boosted - a.boosted 
            : b.totalAmount - a.totalAmount;
        }
      });
    };

    // Sort pinned and unpinned tokens separately
    return [...sortTokens(pinnedTokens), ...sortTokens(unpinnedTokens)];
  }, [filteredTokens, sortBy, voteScores]);

  const handleVote = async (tokenAddress: string, vote: 1 | -1) => {
    try {
      if (userVotes[tokenAddress] !== undefined) {
        toast({
          title: "Cannot vote again",
          description: "You have already voted for this token",
          variant: "destructive"
        });
        return;
      }

      console.log('Sending vote request:', {
        tokenAddress,
        vote,
        userId,
        timestamp: Date.now()
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tokenAddress, 
          vote,
          userId,
          timestamp: Date.now() 
        }),
      });

      const responseData = await response.json();
      console.log('Vote response:', {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      });

      if (!response.ok) {
        const errorMessage = responseData?.error || responseData?.message || 'Failed to save vote';
        console.error('Vote error details:', responseData);
        throw new Error(errorMessage);
      }
      
      setVotes(prev => ({
        ...prev,
        [tokenAddress]: responseData
      }));
      setUserVotes(prev => ({
        ...prev,
        [tokenAddress]: vote
      }));

      toast({
        title: "Vote submitted",
        description: "Your vote has been recorded successfully",
      });
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit vote. Please try again later.",
        variant: "destructive"
      });
    }
  };

  const handlePin = async (tokenAddress: string, hours: number, cost: number) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/pin-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tokenAddress, 
          hours, 
          cost,
          timestamp: Date.now()
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create pin order');
      }

      const order = await response.json();
      
      toast({
        title: "Payment Required",
        description: (
          <div className="mt-2 flex flex-col gap-2">
            <p>Send exactly {cost} SOL to:</p>
            <div className="flex flex-col gap-2">
              <code className="p-2 bg-muted rounded-md text-xs break-all">
                {order.paymentAddress}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(order.paymentAddress);
                  toast({
                    title: "Copied",
                    description: "Payment address copied to clipboard",
                  });
                }}
                className="w-full px-3 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90"
              >
                Copy Address
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Order expires in 30 minutes</p>
          </div>
        ),
      });
    } catch (error) {
      console.error('Error creating pin order:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create pin order",
        variant: "destructive"
      });
    }
  };

  // Add WebSocket connection setup
  useEffect(() => {
    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || isConnecting) {
        return;
      }

      setIsConnecting(true);
      console.log('Connecting to WebSocket...');

      try {
        // Use environment-specific WebSocket URL
        const wsUrl = import.meta.env.DEV 
          ? 'ws://localhost:3001' // Development WebSocket URL
          : (import.meta.env.VITE_WS_URL || 'wss://api.dexboost.xyz'); // Production WebSocket URL
        
        console.log('Using WebSocket URL:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnecting(false);
          setWsRetries(0);
          setError(null);
          lastMessageTimeRef.current = Date.now();

          // Start heartbeat
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          heartbeatIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
              
              // Check if we haven't received any message for too long
              const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
              if (timeSinceLastMessage > 45000) { // 45 seconds
                console.log('No message received for too long, reconnecting...');
                ws.close();
              }
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            lastMessageTimeRef.current = Date.now();
            const data = JSON.parse(event.data);

            if (data.type === 'pong') {
              return;
            }

            if (data.type === 'update' || data.type === 'PIN_UPDATE' || data.type === 'BOOST_UPDATE' || data.type === 'NEW_TOKEN') {
              const updatedToken = {
                ...data.token,
                boosted: data.token.boosted || Date.now(),
                amount: data.token.amount || 0,
                totalAmount: data.token.totalAmount || 0,
                pinnedUntil: data.token.pinnedUntil || 0
              };

              setTokens(prevTokens => {
                const index = prevTokens.findIndex(t => t.tokenAddress === data.token.tokenAddress);
                let newTokens;

                if (index !== -1) {
                  // Update existing token
                  newTokens = [...prevTokens];
                  newTokens[index] = updatedToken;
                } else {
                  // Add new token at the beginning
                  newTokens = [updatedToken, ...prevTokens];
                }

                // Force time update to ensure proper sorting
                nowRef.current = Date.now();
                forceUpdate();

                return newTokens;
              });

              // Show toast for new tokens
              if (data.type === 'NEW_TOKEN') {
                toast({
                  title: "New Token Added",
                  description: `${updatedToken.tokenName} (${updatedToken.tokenSymbol}) has been added with ${updatedToken.totalAmount} boosts`,
                });
              }
            } else if (data.type === 'VOTE_UPDATE') {
              setVotes(prev => ({
                ...prev,
                [data.tokenAddress]: data.votes
              }));
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
          setIsConnecting(false);
          wsRef.current = null;

          // Clear heartbeat interval
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }

          // Attempt to reconnect unless manually closed
          if (!isManualClose && wsRetries < maxRetries) {
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            const backoffTime = Math.min(1000 * Math.pow(2, wsRetries), 30000);
            reconnectTimeoutRef.current = setTimeout(() => {
              setWsRetries(prev => prev + 1);
              connectWebSocket();
            }, backoffTime);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (wsRef.current) {
            wsRef.current.close();
          }
        };
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        setIsConnecting(false);
        setError('Failed to connect to WebSocket');
      }
    };

    connectWebSocket();

    // Cleanup function
    return () => {
      setIsManualClose(true);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [wsRetries, isManualClose]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!tokens || tokens.length === 0) {
    return <div>No tokens available</div>;
  }

  return (
    <Card className="w-full border-none">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <CardTitle>DexBoost.xyz</CardTitle>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('time')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'time'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                By Time
              </button>
              <button
                onClick={() => setSortBy('boosts')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'boosts'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                By Boosts
              </button>
              <button
                onClick={() => setSortBy('votes')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'votes'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                By Votes
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="Search by name, ticker, or contract address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-md border border-input bg-background text-l"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {filteredAndSortedTokens.map((token) => {
            if (!token || !token.tokenAddress) return null;
            
            return (
              <div 
                key={token.tokenAddress}
                className={`p-4 rounded-lg border ${
                  token.pinnedUntil > nowRef.current ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-card'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-muted">
                        {token.icon ? (
                          <img 
                            src={token.icon} 
                            alt={token.tokenSymbol} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMjRDMTguNjI3NCAyNCAyNCAxOC42Mjc0IDI0IDEyQzI0IDUuMzcyNTggMTguNjI3NCAwIDEyIDBDNS4zNzI1OCAwIDAgNS4zNzI1OCAwIDEyQzAgMTguNjI3NCA1LjM3MjU4IDI0IDEyIDI0WiIgZmlsbD0iI0Q5RDlEOSIvPjwvc3ZnPg==';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            {token.tokenSymbol?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                      
                      {token.pinnedUntil > nowRef.current && (
                        <div className="absolute -top-2 -left-2 text-orange-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                          </svg>
                        </div>
                      )}
                      
                      {token.dateAdded && Date.now() - token.dateAdded < 5000 && (
                        <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                          NEW
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">
                          <a 
                            href={`https://dexscreener.com/solana/${token.tokenAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {token.tokenName.length > 25 ? `${token.tokenName.slice(0, 22)}...` : token.tokenName}
                          </a>
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(token.tokenAddress);
                            toast({
                              title: "Address copied",
                              description: "Contract address copied to clipboard",
                            });
                          }}
                          className="hover:opacity-70 transition-opacity"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                      </div>
                      <span className="text-sm text-muted-foreground">{token.tokenSymbol}</span>
                    </div>
                  </div>

                  <div className="w-10 h-10">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="hover:text-primary transition-colors text-muted-foreground w-full h-full flex items-center justify-center">
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            className="w-6 h-6"
                          >
                            <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                          </svg>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2">
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handlePin(token.tokenAddress, 1, 0.5)}
                            className="flex justify-between items-center w-full px-3 py-2 text-sm rounded-md hover:bg-muted"
                          >
                            Pin for 1 hour
                            <span className="text-muted-foreground">0.5 SOL</span>
                          </button>
                          <button
                            onClick={() => handlePin(token.tokenAddress, 4, 1.5)}
                            className="flex justify-between items-center w-full px-3 py-2 text-sm rounded-md hover:bg-muted"
                          >
                            Pin for 4 hours
                            <span className="text-muted-foreground">1.5 SOL</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Current Boost</div>
                    <div className="flex items-center gap-2 mt-1">
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className={`h-4 w-4 ${token.amount > 49 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        <path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"></path>
                      </svg>
                      <span className={`font-medium ${token.amount > 49 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {token.amount}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-muted-foreground">Total Boosts</div>
                    <div className="flex items-center gap-2 mt-1">
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className={`h-4 w-4 ${token.totalAmount > 499 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        <path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"></path>
                      </svg>
                      <span className={`font-medium ${token.totalAmount > 499 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {token.totalAmount}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-muted-foreground">Socials</div>
                    <div className="flex gap-2 mt-1">
                      {token.links?.map((link, index) => (
                        link?.url && (
                          <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary transition-colors"
                          >
                            <span dangerouslySetInnerHTML={{ __html: getSocialIcon(link.type) }} />
                          </a>
                        )
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Market Cap</div>
                    <div className="mt-1 font-medium">
                      {formatNumber(token.marketCap)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">24h Volume</div>
                    <div className="mt-1 font-medium">
                      {formatNumber(token.volume24h)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Boost</div>
                    <div className="mt-1 font-medium">
                      {formatDistanceToNow(token.boosted, { addSuffix: true })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center mt-4">
                  <div className="flex items-center gap-2">
                    {votes[token.tokenAddress] && (
                      <span className={`font-medium text-sm ${
                        votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes > 0
                          ? 'text-green-500'
                          : votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      }`}>
                        {votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes}
                      </span>
                    )}
                    
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={() => handleVote(token.tokenAddress, 1)}
                        className={`hover:text-primary transition-colors p-1.5 rounded-md ${
                          userVotes[token.tokenAddress] === 1 
                            ? 'text-primary bg-primary/10' 
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                        disabled={userVotes[token.tokenAddress] === 1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleVote(token.tokenAddress, -1)}
                        className={`hover:text-primary transition-colors p-1.5 rounded-md ${
                          userVotes[token.tokenAddress] === -1 
                            ? 'text-primary bg-primary/10' 
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                        disabled={userVotes[token.tokenAddress] === -1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
} 