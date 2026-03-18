import { supabase } from './supabaseClient';
import { User } from '../../models/User';

export interface SignUpData {
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
}

/**
 * Sign up a new user with Supabase Authentication
 */
export async function signUp(data: SignUpData): Promise<AuthResponse> {
  try {
    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          role: data.role,
        },
      },
    });

    if (authError) {
      return {
        user: null,
        error: authError.message,
      };
    }

    if (!authData.user) {
      return {
        user: null,
        error: 'Failed to create user account',
      };
    }

    // Create user profile in users table
    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      email: data.email,
      name: data.name,
      role: data.role,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      // If profile creation fails, we should probably delete the auth user
      console.error('Profile creation error:', profileError);
      return {
        user: null,
        error: 'Failed to create user profile. Please try again.',
      };
    }

    const user: User = {
      id: authData.user.id,
      email: data.email,
      name: data.name,
      role: data.role,
    };

    return {
      user,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
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
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      return {
        user: null,
        error: authError.message,
      };
    }

    if (!authData.user) {
      return {
        user: null,
        error: 'Failed to sign in',
      };
    }

    // Fetch user profile from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      return {
        user: null,
        error: 'Failed to fetch user profile',
      };
    }

    return {
      user: userData as User,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
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
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return null;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return userData ? (userData as User) : null;
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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return { error: errorMessage };
  }
}
