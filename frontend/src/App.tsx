import { TokenTable } from './components/TokenTable';
import { Toaster } from './components/ui/toaster';

function App() {
    return (
        <div className="min-h-screen bg-background dark">
            <main className="container mx-auto py-10">
                <TokenTable />
            </main>
            <Toaster />
        </div>
    );
}

export default App;
