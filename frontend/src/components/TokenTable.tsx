import { useEffect, useState, useMemo } from 'react';
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

interface Token {
  tokenName: string;
  tokenAddress: string;
  tokenSymbol: string;
  marketCap: number;
  currentPrice: number;
  liquidity: number;
  volume24h: number;
  volume6h: number;
  volume1h: number;
  totalAmount: number;
  amount: number;
  boosted: number;
  dateAdded: number;
  pinnedUntil: number;
  links: Array<{ type: string; url?: string; }>;
  icon: string;
  votes?: {
    upvotes: number;
    downvotes: number;
  };
  userVote?: number | null;
}

export function TokenTable() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsRetries, setWsRetries] = useState(0);
  const [sortBy, setSortBy] = useState<'time' | 'boosts' | 'votes'>('time');
  const [searchQuery, setSearchQuery] = useState('');
  const maxRetries = 5;
  const retryTimeout = 3000;
  const { toast } = useToast();
  const [votes, setVotes] = useState<Record<string, { upvotes: number; downvotes: number }>>({});
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [prevPositions, setPrevPositions] = useState<Record<string, number>>({});
  const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Initial fetch
    fetchTokens();

    let ws: WebSocket | null = null;
    
    const connectWebSocket = () => {
      if (wsRetries >= maxRetries) {
        setError('Failed to connect to WebSocket after multiple attempts');
        return;
      }

      ws = new WebSocket(import.meta.env.VITE_WS_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setError(null);
        setWsRetries(0);
      };

      ws.onmessage = (event) => {
        try {
          const newToken = JSON.parse(event.data);
          // Handle vote updates separately
          if (newToken.type === 'VOTE_UPDATE') {
            setVotes(prev => ({
              ...prev,
              [newToken.tokenAddress]: newToken.votes
            }));
            return;
          }

          // Handle pin updates
          if (newToken.type === 'PIN_UPDATE' || newToken.type === 'PIN_EXPIRED') {
            fetchTokens(); // Refresh the token list
            if (newToken.type === 'PIN_UPDATE') {
              toast({
                title: "Token Pinned",
                description: "Your token has been successfully pinned!",
              });
            }
            return;
          }

          // Validate the token data
          if (!newToken || typeof newToken !== 'object') {
            console.error('Invalid token data received');
            return;
          }

          // Parse links if it's a string
          if (typeof newToken.links === 'string') {
            try {
              newToken.links = JSON.parse(newToken.links);
            } catch (e) {
              console.error('Error parsing links:', e);
              newToken.links = [];
            }
          }

          // Ensure links is an array
          if (!Array.isArray(newToken.links)) {
            newToken.links = [];
          }

          // Filter out invalid links
          newToken.links = newToken.links.filter((link: { type?: string; url?: string }) => 
            link && 
            typeof link === 'object' && 
            typeof link.url === 'string' &&
            link.url.trim() !== ''
          );

          // Ensure all required numeric fields exist
          const sanitizedToken = {
            ...newToken,
            marketCap: newToken.marketCap || 0,
            liquidity: newToken.liquidity || 0,
            volume24h: newToken.volume24h || 0,
            volume6h: newToken.volume6h || 0,
            volume1h: newToken.volume1h || 0,
            totalAmount: newToken.totalAmount || 0,
            amount: newToken.amount || 0,
            boosted: newToken.boosted || Date.now(),
            dateAdded: newToken.dateAdded || Date.now()
          };

          setTokens(prevTokens => {
            const updatedTokens = prevTokens.filter(t => t.tokenAddress !== sanitizedToken.tokenAddress);
            return [sanitizedToken, ...updatedTokens];
          });
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Try to reconnect after timeout
        setTimeout(() => {
          setWsRetries(prev => prev + 1);
          connectWebSocket();
        }, retryTimeout);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/tokens`);
      if (!response.ok) throw new Error('Failed to fetch tokens');
      const data = await response.json();
      // Parse links for each token if they're strings
      const parsedData = data.map((token: Token) => {
        if (typeof token.links === 'string') {
          try {
            return {
              ...token,
              links: JSON.parse(token.links)
            };
          } catch (e) {
            console.error('Error parsing links for token:', token.tokenAddress, e);
            return {
              ...token,
              links: []
            };
          }
        }
        return token;
      });
      setTokens(parsedData);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number | undefined | null) => {
    if (num === undefined || num === null) return '$0.00';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getSocialIcon = (type: string | undefined) => {
    if (!type) return '🔗';
    
    switch (type.toLowerCase()) {
      case 'twitter':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.282 1H10.992L7.255 5.27L11.649 11.079H8.21L5.515 7.555L2.43 11.08H0.721L4.716 6.513L0.5 1H4.028L6.464 4.22L9.282 1ZM8.682 10.056H9.629L3.513 1.97H2.497L8.682 10.056Z" fill="#4B4D51"></path></svg>';
      case 'pumpfun':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.92039 1.3088C6.99879 0.230399 8.74723 0.230399 9.82569 1.3088C10.904 2.38721 10.904 4.13565 9.82569 5.21405L7.873 7.16667L3.96777 3.26142L5.92039 1.3088Z" fill="currentColor"></path><path d="M5.34857 9.69375C4.27017 10.7722 2.52173 10.7722 1.44333 9.69375C0.36492 8.61537 0.36492 6.86694 1.44333 5.78854L3.39596 3.83594L7.30119 7.74116L5.34857 9.69375Z" fill="currentColor"></path></svg>';
      case 'solscan':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><g clip-path="url(#clip0_7285_39158)"><path d="M6.01636 4.00009C7.13373 4.01022 8.01559 4.91214 7.99979 6.02777C7.98393 7.1438 7.0732 8.02421 5.96028 7.99949C4.85998 7.97516 3.99715 7.0927 4.00001 5.99492C4.00286 4.8797 4.90179 3.98995 6.01636 4.00009Z" fill="currentColor"></path><path d="M9.09457 11.0489C7.02966 12.7106 3.33988 12.1159 1.42869 9.87967C-0.673669 7.41975 -0.428175 3.72916 1.98302 1.54378C4.36487 -0.614703 8.04984 -0.495668 10.2963 1.81258C12.4769 4.05314 12.5735 7.7706 10.5326 9.86864C10.0561 9.36989 9.57918 8.87024 9.07918 8.34705C9.85297 7.26616 10.0927 6.02924 9.63014 4.70113C8.93944 2.71831 6.7516 1.67194 4.75634 2.34776C2.78465 3.01542 1.7054 5.13647 2.32113 7.1332C2.94361 9.15202 5.05512 10.2987 7.0816 9.67664C7.485 9.55282 7.70888 9.62527 7.96969 9.92527C8.31455 10.3227 8.71368 10.6731 9.09457 11.0489Z" fill="currentColor"></path></g><defs><clipPath id="clip0_7285_39158"><rect width="12" height="12" fill="white"></rect></clipPath></defs></svg>';
      case 'telegram':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="12" viewBox="0 0 12 12" fill="none"><g clip-path="url(#clip0_12893_33676)"><mask id="mask0_12893_33676" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12" style="mask-type: luminance;"><path d="M12 0H0V12H12V0Z" fill="white"></path></mask><g mask="url(#mask0_12893_33676)"><path d="M11.8939 1.90992L10.0939 10.3969C9.9599 10.9969 9.6039 11.1429 9.1019 10.8619L6.3599 8.84192L5.0379 10.1149C4.8909 10.2619 4.7679 10.3849 4.4869 10.3849L4.6829 7.59192L9.7639 2.99992C9.9839 2.80392 9.7139 2.69292 9.4199 2.88992L3.1379 6.84392L0.429897 5.99992C-0.158103 5.81692 -0.170103 5.41192 0.551897 5.13092L11.1339 1.05292C11.6239 0.869924 12.0519 1.16292 11.8939 1.90992Z" fill="#4B4D51"></path></g></g><defs><clipPath id="clip0_12893_33676"><rect width="12" height="12" fill="white"></rect></clipPath></defs></svg>';
      case 'discord':
        return '💬';
      case 'website':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="12" viewBox="0 0 12 12" fill="none"><g clip-path="url(#clip0_12893_33682)"><mask id="mask0_12893_33682" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12" style="mask-type: luminance;"><path d="M12 0H0V12H12V0Z" fill="white"></path></mask><g mask="url(#mask0_12893_33682)"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 0C2.6862 0 0 2.6862 0 6C0 9.3138 2.6862 12 6 12C9.3138 12 12 9.3138 12 6C12 2.6862 9.3138 0 6 0ZM3.8676 1.6986C3.02049 2.11996 2.31605 2.78121 1.842 3.6H3.2358C3.363 2.9862 3.5388 2.424 3.7548 1.938C3.7908 1.8564 3.8286 1.7766 3.8676 1.6986ZM1.2 6C1.2 5.586 1.2528 5.184 1.3512 4.8H3.0564C2.98007 5.59818 2.98007 6.40182 3.0564 7.2H1.3512C1.25049 6.80796 1.19968 6.40477 1.2 6ZM1.842 8.4C2.31605 9.21879 3.02049 9.88004 3.8676 10.3014C3.82822 10.2225 3.79061 10.1426 3.7548 10.062C3.5388 9.576 3.363 9.0138 3.2358 8.4H1.842ZM4.4652 8.4C4.569 8.8392 4.7004 9.2352 4.851 9.5748C5.0478 10.0176 5.2668 10.3386 5.4792 10.5408C5.6892 10.7406 5.8638 10.8 6 10.8C6.1362 10.8 6.3108 10.74 6.5202 10.5408C6.7332 10.3386 6.9522 10.0176 7.149 9.5748C7.2996 9.2352 7.431 8.8392 7.5348 8.4H4.4652ZM8.7642 8.4C8.65046 8.97079 8.47648 9.52791 8.2452 10.062C8.2092 10.1436 8.1714 10.2234 8.1324 10.3014C8.97951 9.88004 9.68395 9.21879 10.158 8.4H8.7642ZM10.6482 7.2H8.9436C9.01987 6.40182 9.01987 5.59818 8.9436 4.8H10.6488C10.7478 5.184 10.8 5.586 10.8 6C10.8 6.414 10.7472 6.816 10.6482 7.2ZM7.7376 7.2H4.2624C4.22042 6.80138 4.19959 6.40082 4.2 6C4.2 5.5842 4.2222 5.1828 4.2624 4.8H7.7376C7.7778 5.1828 7.8 5.5842 7.8 6C7.8 6.4158 7.7778 6.8172 7.7376 7.2ZM8.7636 3.6H10.158C9.68395 2.78121 8.97951 2.11996 8.1324 1.6986C8.1714 1.7766 8.2092 1.8564 8.2452 1.938C8.4612 2.424 8.637 2.9862 8.7642 3.6H8.7636ZM4.8516 2.4252C4.7004 2.7648 4.5696 3.1608 4.4652 3.6H7.5348C7.44242 3.19742 7.31328 2.80417 7.149 2.4252C6.9522 1.9824 6.7332 1.6614 6.5208 1.4592C6.3108 1.2594 6.1356 1.2 6 1.2C5.8638 1.2 5.6892 1.26 5.4792 1.4592C5.2668 1.6614 5.0478 1.9824 4.851 2.4252H4.8516Z" fill="#4B4D51"></path></g></g><defs><clipPath id="clip0_12893_33682"><rect width="12" height="12" fill="white"></rect></clipPath></defs></svg>';
      default:
        return '🔗';
    }
  };

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
        const now = Date.now();
        const aIsPinned = a.pinnedUntil > now;
        const bIsPinned = b.pinnedUntil > now;

        // If both tokens are pinned or both are not pinned, use the regular sorting
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

        // Pinned tokens always come first
        return bIsPinned ? 1 : -1;
      });
  }, [tokens, searchQuery, sortBy, votes]);

  // Add vote handling function
  const handleVote = async (tokenAddress: string, vote: 1 | -1) => {
    try {
      // Check if user has already voted for this token
      if (userVotes[tokenAddress] !== undefined) {
        toast({
          title: "Cannot vote again",
          description: "You have already voted for this token",
          variant: "destructive"
        });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokenAddress, vote }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to vote');
      }
      
      const newVotes = await response.json();
      setVotes(prev => ({
        ...prev,
        [tokenAddress]: newVotes
      }));
      setUserVotes(prev => ({
        ...prev,
        [tokenAddress]: vote
      }));
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit vote",
        variant: "destructive"
      });
    }
  };

  // Add function to fetch initial votes
  const fetchVotes = async (tokenAddress: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/vote/${tokenAddress}`);
      if (!response.ok) throw new Error('Failed to fetch votes');
      const data = await response.json();
      setVotes(prev => ({
        ...prev,
        [tokenAddress]: data.votes
      }));
      if (data.userVote !== null) {
        setUserVotes(prev => ({
          ...prev,
          [tokenAddress]: data.userVote
        }));
      }
    } catch (error) {
      console.error('Error fetching votes:', error);
    }
  };

  // Fetch votes when tokens change
  useEffect(() => {
    tokens.forEach(token => {
      fetchVotes(token.tokenAddress);
    });
  }, [tokens]);

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
  }, [filteredAndSortedTokens]); // Only depend on filteredAndSortedTokens

  // Add pin handling function
  const handlePin = async (tokenAddress: string, hours: number, cost: number) => {
    try {
      const response = await fetch('http://localhost:3000/api/pin-order', {
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

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
          <div className="flex justify-between items-center">
            <CardTitle>Token Boosts</CardTitle>
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
        <Table>
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
                  token.pinnedUntil > Date.now() ? 'bg-orange-100 dark:bg-orange-900/30' : ''
                }`}
              >
                <TableCell className="font-medium">
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
                      {token.pinnedUntil > Date.now() && (
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
                        >
                          {token.tokenName}
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
                          title="Copy contract address"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline-block text-muted-foreground hover:text-foreground">
                            <g clipPath="url(#clip0_13144_32684)">
                              <mask id="mask0_13144_32684" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12" style={{ maskType: 'luminance' }}>
                                <path d="M12 0H0V12H12V0Z" fill="white"></path>
                              </mask>
                              <g mask="url(#mask0_13144_32684)">
                                <path d="M6.858 2.57031H2.571C1.15108 2.57031 0 3.72139 0 5.14131V9.42831C0 10.8482 1.15108 11.9993 2.571 11.9993H6.858C8.27792 11.9993 9.429 10.8482 9.429 9.42831V5.14131C9.429 3.72139 8.27792 2.57031 6.858 2.57031Z" fill="currentColor"></path>
                                <path fillRule="evenodd" clipRule="evenodd" d="M2.71289 1.728C2.80689 1.718 2.90289 1.714 2.99989 1.714H7.28589C8.08154 1.714 8.8446 2.03007 9.40721 2.59268C9.96982 3.15529 10.2859 3.91835 10.2859 4.714V9C10.2859 9.097 10.2809 9.193 10.2719 9.287C10.7767 9.11165 11.2143 8.78344 11.524 8.34796C11.8336 7.91248 12 7.39136 11.9999 6.857V2.571C11.9999 1.88913 11.729 1.23518 11.2469 0.753028C10.7647 0.270872 10.1108 0 9.42889 0L5.14289 0C4.01789 0 3.06289 0.722 2.71289 1.728Z" fill="currentColor"></path>
                              </g>
                            </g>
                            <defs>
                              <clipPath id="clip0_13144_32684">
                                <rect width="12" height="12" fill="white"></rect>
                              </clipPath>
                            </defs>
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
                    {token.pinnedUntil > now ? (
                      <div className="text-xs text-orange-500">
                        {formatDistance(token.pinnedUntil, now, { addSuffix: true })}
                      </div>
                    ) : (
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
                    )}
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