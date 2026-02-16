import { useState, useEffect } from 'react';
import { useAuthStore } from '../lib/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Loader2, Shield, User } from 'lucide-react';

type LoginMode = 'staff' | 'driver';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [loginMode, setLoginMode] = useState<LoginMode>('staff');
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await fetch('/api/auth/needs-setup', { credentials: "include" });
        const data = await response.json();
        setNeedsSetup(data.needsSetup);
      } catch (err) {
        setNeedsSetup(false);
      }
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (needsSetup) {
        const response = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Setup failed');
        }

        setNeedsSetup(false);
        setError('');
        setUsername('');
        setPassword('');
      } else {
        const endpoint = loginMode === 'driver' ? '/api/auth/driver-login' : '/api/auth/login';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Login failed');
        }

        login(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            {needsSetup ? (
              <Shield className="h-8 w-8 text-purple-400" />
            ) : loginMode === 'driver' ? (
              <Truck className="h-8 w-8 text-green-400" />
            ) : (
              <User className="h-8 w-8 text-blue-400" />
            )}
            <span className="text-2xl font-bold text-white">RxRouteOptimizer</span>
          </div>
          <CardTitle className="text-white">
            {needsSetup ? 'Initial Setup' : loginMode === 'driver' ? 'Driver Login' : 'Staff Login'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {needsSetup 
              ? 'Create your admin account to get started'
              : loginMode === 'driver'
              ? 'Enter your driver credentials'
              : 'Enter your credentials to access the dashboard'
            }
          </CardDescription>
          {!needsSetup && (
            <div className="flex gap-2 mt-4">
              <Button
                type="button"
                variant={loginMode === 'staff' ? 'default' : 'outline'}
                className={`flex-1 ${loginMode === 'staff' ? 'bg-blue-600' : 'border-slate-600 text-slate-300'}`}
                onClick={() => { setLoginMode('staff'); setError(''); }}
              >
                <User className="h-4 w-4 mr-2" />
                Staff
              </Button>
              <Button
                type="button"
                variant={loginMode === 'driver' ? 'default' : 'outline'}
                className={`flex-1 ${loginMode === 'driver' ? 'bg-green-600' : 'border-slate-600 text-slate-300'}`}
                onClick={() => { setLoginMode('driver'); setError(''); }}
              >
                <Truck className="h-4 w-4 mr-2" />
                Driver
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-200">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Enter password"
                required
              />
            </div>
            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">
                {error}
              </div>
            )}
            <Button 
              type="submit" 
              className={`w-full ${
                needsSetup 
                  ? 'bg-purple-600 hover:bg-purple-700' 
                  : loginMode === 'driver' 
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
              }`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {needsSetup ? 'Creating Admin...' : 'Signing in...'}
                </>
              ) : (
                needsSetup ? 'Create Admin Account' : 'Sign In'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
