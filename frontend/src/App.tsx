import { TokenTable } from './components/TokenTable';
import { MobileTokenTable } from './components/MobileTokenTable';
import { Toaster } from './components/ui/toaster';
import { Footer } from './components/Footer';
import { useState, useEffect } from 'react';
import { Token } from './lib/types';

// Generate a random user ID if not exists
const getUserId = () => {
    const storedId = localStorage.getItem('userId');
    if (storedId) return storedId;
    
    const newId = crypto.randomUUID();
    localStorage.setItem('userId', newId);
    return newId;
};

export function App() {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [sortBy, setSortBy] = useState('time');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [votes, setVotes] = useState<Record<string, { upvotes: number; downvotes: number }>>({});
    const [userVotes, setUserVotes] = useState<Record<string, number>>({});
    const [userId] = useState(getUserId());

    // Add fetch tokens function
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

    // Add fetch votes function
    const fetchVotes = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/votes`);
            if (!response.ok) throw new Error('Failed to fetch votes');
            const data = await response.json();
            setVotes(data);
        } catch (err) {
            console.error('Error fetching votes:', err);
        }
    };

    // Add useEffect for initial data fetch
    useEffect(() => {
        fetchTokens();
        fetchVotes();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Pass shared state to both components
    const sharedProps = {
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
    };

    return (
        <div className="min-h-screen bg-background dark flex flex-col">
            <main className="container mx-auto py-10 flex-grow">
                {isMobile ? (
                    <MobileTokenTable {...sharedProps} />
                ) : (
                    <TokenTable {...sharedProps} />
                )}
            </main>
            <Footer />
            <Toaster />
        </div>
    );
}

export default App;