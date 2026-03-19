import axios from 'axios';
import { User } from '../../models/User';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;

// Validate config
if (!API_URL || !ANON_KEY) {
  console.error('Missing Supabase configuration:', { API_URL, ANON_KEY });
}

const axiosInstance = axios.create({
  baseURL: `${API_URL}/auth/v1`,
  headers: {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
  },
  timeout: 10000,
});

// Add request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    console.log('Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging and error handling
axiosInstance.interceptors.response.use(
  (response) => {
    console.log('Response status:', response.status);
    return response;
  },
  (error) => {
    console.error('Response error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

// Retry logic for rate limiting
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper function to create or update user profile
async function createOrUpdateUserProfile(
  authUserId: string,
  email: string,
  name: string,
  role: 'contractor' | 'driver' | 'admin',
  accessToken: string
): Promise<void> {
  try {
    console.log('Creating/updating user profile for:', { authUserId, email, name, role });
    
    const response = await axios.post(
      `${API_URL}/rest/v1/users`,
      {
        auth_id: authUserId,  // Store the Supabase Auth UUID in auth_id field
        email,
        name,
        role,
        created_at: new Date().toISOString(),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    console.log('Profile creation response:', response.status, response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Profile creation failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
    } else {
      console.error('Profile creation error:', error);
    }
    // Don't throw - continue without profile
  }
}export interface SignUpData {
  email: string;
  password: string;
  name: string;
  role: 'contractor' | 'driver' | 'admin';
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User | null;
  error: string | null;
  accessToken?: string | null;
}

/**
 * Sign up a new user with Supabase Authentication
 */
export async function signUp(data: SignUpData): Promise<AuthResponse> {
  try {
    // Create user with Supabase Auth with retry logic
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post('/signup', {
        email: data.email,
        password: data.password,
      });
    });

    console.log('Auth response:', response.data);

    const authUser = response.data.user;

    if (!authUser) {
      console.error('No user returned from auth endpoint. Full response:', response.data);
      return {
        user: null,
        error: response.data?.error_description || response.data?.message || 'Failed to create user account',
      };
    }

    // Create user profile in users table
    const accessToken = response.data.access_token;
    console.log('Starting profile creation with access token:', accessToken.substring(0, 20) + '...');
    
    await createOrUpdateUserProfile(
      authUser.id,
      data.email,
      data.name,
      data.role,
      accessToken
    );
    
    console.log('Profile creation completed');

    const user: User = {
      id: authUser.id,
      auth_id: authUser.id,
      email: data.email,
      name: data.name,
      role: data.role,
    };

    return {
      user,
      error: null,
      accessToken: accessToken || null,
    };
  } catch (error) {
    console.error('Sign up error details:', error);
    let errorMessage = 'An unexpected error occurred';
    
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else {
        errorMessage = error.response?.data?.error_description || 
                       error.response?.data?.message || 
                       error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Sign in an existing user
 */
export async function signIn(data: SignInData): Promise<AuthResponse> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post('/token?grant_type=password', {
        email: data.email,
        password: data.password,
      });
    });

    console.log('Sign in response:', response.data);

    const authUser = response.data.user;
    const accessToken = response.data.access_token;

    if (!authUser) {
      console.error('No user returned from sign in. Full response:', response.data);
      return {
        user: null,
        error: response.data?.error_description || response.data?.message || 'Failed to sign in',
      };
    }

    // Fetch user profile from users table
    try {
      const profileResponse = await retryWithBackoff(async () => {
        return await axios.get(
          `${API_URL}/rest/v1/users?auth_id=eq.${authUser.id}&select=*`,
          {
            headers: {
              'apikey': ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
      });

      const userData = profileResponse.data[0];

      if (userData) {
        console.log('User profile found:', userData);
        return {
          user: userData as User,
          error: null,
          accessToken: accessToken || null,
        };
      } else {
        console.log('No user profile found, creating one...');
        // Profile doesn't exist, create it now
        await createOrUpdateUserProfile(
          authUser.id,
          authUser.email,
          authUser.user_metadata?.name || '',
          authUser.user_metadata?.role || 'driver',
          accessToken
        );
      }
    } catch (err) {
      console.error('Error fetching user profile:', {
        error: err,
        status: axios.isAxiosError(err) ? err.response?.status : 'unknown',
        data: axios.isAxiosError(err) ? err.response?.data : 'unknown',
      });
    }

    // Return user based on auth data (profile will be created/updated in background)
    return {
      user: {
        id: authUser.id,
        auth_id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name || '',
        role: authUser.user_metadata?.role || 'driver',
      },
      error: null,
      accessToken: accessToken || null,
    };
  } catch (error) {
    console.error('Sign in error details:', error);
    let errorMessage = 'An unexpected error occurred';
    
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else {
        errorMessage = error.response?.data?.error_description || 
                       error.response?.data?.message || 
                       error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error: string | null }> {
  try {
    // Supabase signout is client-side only for this approach
    return { error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return { error: errorMessage };
  }
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    // This would require storing the user in local storage or app state
    // For now, return null
    return null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Request a password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  try {
    await axiosInstance.post('/recover', {
      email,
    });
    return { error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return { error: errorMessage };
  }
}
