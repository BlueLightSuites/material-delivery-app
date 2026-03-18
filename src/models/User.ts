export type User = {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role?: 'contractor' | 'driver' | 'admin';
    createdAt?: string;
  };