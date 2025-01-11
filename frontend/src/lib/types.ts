export interface Token {
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

export interface TokenTableProps {
  tokens: Token[];
  setTokens: React.Dispatch<React.SetStateAction<Token[]>>;
  sortBy: string;
  setSortBy: React.Dispatch<React.SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  votes: Record<string, { upvotes: number; downvotes: number }>;
  setVotes: React.Dispatch<React.SetStateAction<Record<string, { upvotes: number; downvotes: number }>>>;
  userVotes: Record<string, number>;
  setUserVotes: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  userId: string;
} 