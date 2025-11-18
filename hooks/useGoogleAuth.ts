import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '../types';

declare global {
  const google: any;
}

// Simple JWT decoder
function decodeJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    console.error("Failed to decode JWT", e);
    return null;
  }
}

interface CachedToken {
  token: string;
  expiresAt: number; // Expiration timestamp in milliseconds
}

export const useGoogleAuth = () => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        try {
            return JSON.parse(savedUser);
        } catch (e) {
            console.error("Failed to parse user from localStorage", e);
            localStorage.removeItem('user');
            return null;
        }
    }
    return null;
  });
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // New state to signal when GSI is ready
  const inFlightTokenRequest = useRef<Promise<string> | null>(null);
  const cachedTokenRef = useRef<CachedToken | null>(null);


  const handleCredentialResponse = (response: any) => {
    const idToken = response.credential;
    const profileObj = decodeJwt(idToken);
    if (profileObj) {
      const userData: User = {
        id: profileObj.sub,
        name: profileObj.name,
        email: profileObj.email,
        picture: profileObj.picture,
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    }
  };

  const signOut = () => {
    if (google) {
        google.accounts.id.disableAutoSelect();
    }
    setUser(null);
    localStorage.removeItem('user');
    cachedTokenRef.current = null;
  };

  useEffect(() => {
    const initializeGsi = () => {
        const clientId = document.querySelector<HTMLMetaElement>('meta[name="google-signin-client_id"]')?.content;

        if (!clientId || clientId.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
            console.error("Google Client ID not found or not configured. Please update index.html.");
            setIsAuthReady(true); // Set to true to unblock, even on error
            return;
        }

        if (google) {
            google.accounts.id.initialize({
                client_id: clientId,
                callback: handleCredentialResponse,
            });

            const client = google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/spreadsheets',
              callback: () => {},
            });
            setTokenClient(client);
            setIsAuthReady(true); // Signal that the auth client is ready
        }
    }
    
    if (google) {
        initializeGsi();
    } else {
      const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener('load', initializeGsi);
        return () => script.removeEventListener('load', initializeGsi);
      }
    }

  }, []);

  const getAccessToken = useCallback((): Promise<string> => {
    if (cachedTokenRef.current && Date.now() < cachedTokenRef.current.expiresAt - (5 * 60 * 1000)) {
      return Promise.resolve(cachedTokenRef.current.token);
    }
    
    if (inFlightTokenRequest.current) {
      return inFlightTokenRequest.current;
    }

    const authPromise = new Promise<string>((resolve, reject) => {
      if (!tokenClient) {
        inFlightTokenRequest.current = null;
        return reject(new Error('Authentication client not ready.'));
      }
      
      tokenClient.callback = (tokenResponse: any) => {
        inFlightTokenRequest.current = null;
        if (tokenResponse && tokenResponse.access_token) {
          const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;
          cachedTokenRef.current = {
            token: tokenResponse.access_token,
            expiresAt: Date.now() + expiresInMs,
          };
          resolve(tokenResponse.access_token);
        } else {
          console.error('Google Auth Error Response:', tokenResponse);
          const error = tokenResponse?.error_description || tokenResponse?.error || 'Failed to retrieve access token. Permission may have been denied by the user or an admin policy.';
          reject(new Error(error));
        }
      };

      tokenClient.requestAccessToken({ prompt: '' });
    });

    inFlightTokenRequest.current = authPromise;
    return inFlightTokenRequest.current;
  }, [tokenClient]);


  return { user, signOut, getAccessToken, isAuthReady };
};