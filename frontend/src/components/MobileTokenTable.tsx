import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { useToast } from "./ui/use-toast";
import { formatNumber, getSocialIcon } from '../lib/utils';
import { TokenTableProps } from '../lib/types';
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
  const wsRef = useRef<WebSocket | null>(null);
  const maxRetries = 5;
  const { toast } = useToast();
  const nowRef = useRef(Date.now());

  const filteredAndSortedTokens = useMemo(() => {
    return [...tokens]
      .filter(token => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          token.tokenAddress.toLowerCase().includes(query) ||
          token.tokenName.toLowerCase().includes(query) ||
          token.tokenSymbol.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const now = Date.now();
        const aIsPinned = a.pinnedUntil > now;
        const bIsPinned = b.pinnedUntil > now;

        if (aIsPinned === bIsPinned) {
          if (sortBy === 'time') {
            return b.boosted - a.boosted;
          } else if (sortBy === 'votes') {
            const aVotes = votes[a.tokenAddress] || { upvotes: 0, downvotes: 0 };
            const bVotes = votes[b.tokenAddress] || { upvotes: 0, downvotes: 0 };
            const aScore = aVotes.upvotes - aVotes.downvotes;
            const bScore = bVotes.upvotes - bVotes.downvotes;
            return bScore === aScore 
              ? b.totalAmount - a.totalAmount 
              : bScore - aScore;
          } else {
            return b.totalAmount === a.totalAmount 
              ? b.boosted - a.boosted 
              : b.totalAmount - a.totalAmount;
          }
        }

        return bIsPinned ? 1 : -1;
      });
  }, [tokens, searchQuery, sortBy, votes]);

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

  // Update nowRef every minute
  useEffect(() => {
    const interval = setInterval(() => {
      nowRef.current = Date.now();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Add WebSocket connection setup
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const getBackoffTime = (retryCount: number) => {
      return Math.min(1000 * Math.pow(2, retryCount), 30000);
    };

    const connectWebSocket = () => {
      if (isManualClose) return;

      try {
        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
        
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
        }

        wsRef.current = new WebSocket(wsUrl);
        console.log('Attempting WebSocket connection...');

        wsRef.current.onopen = () => {
          console.log('WebSocket connected successfully');
          setWsRetries(0);
          setError(null);
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'update' || data.type === 'PIN_UPDATE' || data.type === 'BOOST_UPDATE' || data.type === 'NEW_TOKEN') {
              setTokens(prevTokens => {
                const updatedTokens = [...prevTokens];
                const index = updatedTokens.findIndex(t => t.tokenAddress === data.token.tokenAddress);
                
                const updatedToken = {
                  ...index !== -1 ? updatedTokens[index] : {},
                  ...data.token,
                  boosted: data.token.boosted || Date.now(),
                  amount: data.token.amount || (index !== -1 ? updatedTokens[index].amount : 0),
                  totalAmount: data.token.totalAmount || (index !== -1 ? updatedTokens[index].totalAmount : 0),
                  pinnedUntil: data.token.pinnedUntil || (index !== -1 ? updatedTokens[index].pinnedUntil : 0)
                };

                if (index !== -1) {
                  updatedTokens[index] = updatedToken;
                } else {
                  if (data.type === 'NEW_TOKEN') {
                    updatedTokens.unshift(updatedToken);
                    toast({
                      title: "New Token Added",
                      description: `${updatedToken.tokenName} (${updatedToken.tokenSymbol}) has been added with ${updatedToken.totalAmount} boosts`,
                    });
                  } else {
                    updatedTokens.push(updatedToken);
                  }
                }
                return updatedTokens;
              });
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

        wsRef.current.onclose = () => {
          if (!isManualClose) {
            console.log('WebSocket connection closed. Attempting to reconnect...');
            setError('WebSocket connection lost. Reconnecting...');
            setWsRetries(prev => prev + 1);

            if (wsRetries < maxRetries) {
              const backoffTime = getBackoffTime(wsRetries);
              reconnectTimeout = setTimeout(connectWebSocket, backoffTime);
            } else {
              setError('Failed to establish WebSocket connection after multiple attempts');
              toast({
                title: "Connection Error",
                description: "Failed to establish connection. Please refresh the page.",
                variant: "destructive"
              });
            }
          }
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      setIsManualClose(true);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [wsRetries, maxRetries, setError, toast, isManualClose]);

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
    <Card className="w-full">
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
            className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm"
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
                        <span className="font-bold">{token.tokenName.length > 25 ? `${token.tokenName.slice(0, 22)}...` : token.tokenName}</span>
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