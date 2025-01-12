import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { formatDistance } from 'date-fns/formatDistance';
import { useToast } from "./ui/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { formatNumber, getSocialIcon } from '../lib/utils';
import { TokenTableProps } from '../lib/types';

export function TokenTable({
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
  const [currentTime, setCurrentTime] = useState(Date.now());
  const nowRef = useRef(Date.now());
  const [prevPositions, setPrevPositions] = useState<Record<string, number>>({});
  const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());

  // Update time every second instead of every minute
  useEffect(() => {
    const interval = setInterval(() => {
      nowRef.current = Date.now();
      setCurrentTime(Date.now()); // This will trigger a re-render
    }, 1000); // Changed from 60000 to 1000
    return () => clearInterval(interval);
  }, []);

  // Memoize filteredAndSortedTokens to prevent unnecessary recalculations
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
        const aIsPinned = a.pinnedUntil > currentTime;
        const bIsPinned = b.pinnedUntil > currentTime;

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
  }, [tokens, searchQuery, sortBy, votes, currentTime]);

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
        body: JSON.stringify({ tokenAddress, hours, cost }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create pin order');
      }

      const order = await response.json();
      
      toast({
        title: "Payment Required",
        description: (
          <div className="mt-2 flex flex-col gap-2">
            <p>Send exactly {cost} SOL to:</p>
            <p>Total Boosts: {tokens.find(t => t.tokenAddress === tokenAddress)?.totalAmount || 0}</p>
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

  // Update positions and trigger animations when sorting changes or votes change
  useEffect(() => {
    const newPositions: Record<string, number> = {};
    filteredAndSortedTokens.forEach((token, index) => {
      newPositions[token.tokenAddress] = index;
    });

    // Find tokens that changed position
    const changedTokens = new Set<string>();
    filteredAndSortedTokens.forEach((token) => {
      if (prevPositions[token.tokenAddress] !== undefined && 
          prevPositions[token.tokenAddress] !== newPositions[token.tokenAddress]) {
        changedTokens.add(token.tokenAddress);
      }
    });

    // Set animating rows
    if (changedTokens.size > 0) {
      setAnimatingRows(changedTokens);

      // Clear animation after it completes
      setTimeout(() => {
        setAnimatingRows(new Set());
      }, 500); // Match this with animation duration
    }

    setPrevPositions(newPositions);
  }, [filteredAndSortedTokens]);

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

                let newTokens;
                if (index !== -1) {
                  // Update existing token
                  updatedTokens[index] = updatedToken;
                  newTokens = updatedTokens;
                } else {
                  // Add new token at the beginning
                  newTokens = [updatedToken, ...updatedTokens];
                  if (data.type === 'NEW_TOKEN') {
                    toast({
                      title: "New Token Added",
                      description: `${updatedToken.tokenName} (${updatedToken.tokenSymbol}) has been added with ${updatedToken.totalAmount} boosts`,
                    });
                  }
                }

                // Force a time update to ensure "time ago" is fresh
                setCurrentTime(Date.now());
                return newTokens;
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

  if (isLoading) return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Loading tokens...</CardTitle>
      </CardHeader>
    </Card>
  );

  if (error) return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-destructive">Error: {error}</CardTitle>
      </CardHeader>
    </Card>
  );

  return (
    <Card className="w-full">
      <style>
        {`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
          .shake-animation {
            animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
          }
        `}
      </style>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start">
            <CardTitle className="mb-2">DexBoost.xyz</CardTitle>
            <div className="flex gap-2 mt-2 md:mt-0 md:ml-auto">
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
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, ticker, or contract address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table className="table-auto w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Last Boost</TableHead>
              <TableHead>Total Boost</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Volume (24h)</TableHead>
              <TableHead>Market Cap</TableHead>
              <TableHead>Socials</TableHead>
              <TableHead>Votes</TableHead>
              <TableHead>Pin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedTokens.map((token) => (
              <TableRow 
                key={token.tokenAddress} 
                className={`group hover:bg-muted/50 ${
                  animatingRows.has(token.tokenAddress) ? 'shake-animation' : ''
                } ${
                  token.pinnedUntil > nowRef.current ? 'bg-orange-100 dark:bg-orange-900/30' : ''
                }`}
              >
                <TableCell className="font-medium w-1/8 md:w-1/10 lg:w-1/8 xl:w-1/6">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
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
                          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                            {token.tokenSymbol?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                      {token.dateAdded && Date.now() - token.dateAdded < 5 * 60 * 1000 && (
                        <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                          NEW
                        </div>
                      )}
                      {token.pinnedUntil > nowRef.current && (
                        <div className="absolute -top-2 -left-2 text-orange-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://dexscreener.com/solana/${token.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary transition-colors"
                          title={token.tokenName}
                        >
                          {token.tokenName.length > 25 ? `${token.tokenName.slice(0, 22)}...` : token.tokenName}
                        </a>
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
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" focusable="false" className={`h-4 w-4 ${token.amount > 49 ? 'text-yellow-500' : 'text-muted-foreground'}`} xmlns="http://www.w3.org/2000/svg">
                      <path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"></path>
                    </svg>
                    <span className={`font-bold ${token.amount > 49 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {token.amount}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" focusable="false" className={`h-4 w-4 ${token.totalAmount > 499 ? 'text-yellow-500' : 'text-muted-foreground'}`} xmlns="http://www.w3.org/2000/svg">
                      <path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"></path>
                    </svg>
                    <span className={`font-bold ${token.totalAmount > 499 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {token.totalAmount}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {formatDistanceToNow(token.boosted, { addSuffix: true })}
                </TableCell>
                <TableCell>{formatNumber(token.volume24h)}</TableCell>
                <TableCell>{formatNumber(token.marketCap)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <a
                      href={`https://pump.fun/coin/${token.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                    >
                      <span dangerouslySetInnerHTML={{ __html: getSocialIcon('pumpfun') }} />
                    </a>
                    <a
                      href={`https://solscan.io/token/${token.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                    >
                      <span dangerouslySetInnerHTML={{ __html: getSocialIcon('solscan') }} />
                    </a>
                    {Array.isArray(token.links) && token.links
                      .filter(link => ['website', 'telegram', 'twitter'].includes(link?.type?.toLowerCase() || ''))
                      .map((link, index) => (
                        link && link.url && (
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
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVote(token.tokenAddress, 1)}
                        className={`hover:text-primary transition-colors ${
                          userVotes[token.tokenAddress] === 1 ? 'text-primary' : 'text-muted-foreground'
                        }`}
                        disabled={userVotes[token.tokenAddress] === 1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleVote(token.tokenAddress, -1)}
                        className={`hover:text-primary transition-colors ${
                          userVotes[token.tokenAddress] === -1 ? 'text-primary' : 'text-muted-foreground'
                        }`}
                        disabled={userVotes[token.tokenAddress] === -1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                        </svg>
                      </button>
                    </div>
                    {votes[token.tokenAddress] && (
                      <span className={
                        votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes > 0
                          ? 'text-green-500'
                          : votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      }>
                        {votes[token.tokenAddress].upvotes - votes[token.tokenAddress].downvotes}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="hover:text-primary transition-colors text-muted-foreground" title="Pin token">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        {token.pinnedUntil > nowRef.current && (
                          <div className="text-xs text-orange-500 px-3 py-1">
                            Currently pinned for {formatDistance(token.pinnedUntil, nowRef.current)}
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
} 