import { useState } from 'react';
import type { FC } from 'react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  isLoading: boolean;
}

export const LoginScreen: FC<LoginScreenProps> = ({ onLogin, onRegister, isLoading }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      if (isRegistering) {
        onRegister(username.trim(), password.trim());
      } else {
        onLogin(username.trim(), password.trim());
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-gray-800/50 p-8 border border-gray-700 rounded-2xl text-center mt-10">
      <h2 className="text-2xl font-bold text-white">{isRegistering ? 'Create an Account' : 'Welcome to SongAssist'}</h2>
      <p className="text-gray-400 mt-2 mb-6">
        {isRegistering ? 'Choose a username and password to get started.' : 'Please enter your credentials to begin.'}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="sr-only">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g., your-name"
            className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
          />
        </div>
        <button 
            type="submit" 
            disabled={isLoading || !username.trim() || !password.trim()} 
            className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : isRegistering ? 'Register' : 'Login'}
        </button>
      </form>
      <div className="mt-4">
          <button onClick={() => setIsRegistering(!isRegistering)} className="text-sm text-teal-400 hover:text-teal-300">
              {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
          </button>
      </div>
    </div>
  );
};