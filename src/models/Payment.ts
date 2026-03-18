export type Payment = {
    id: string;
    jobId: string;
    amount: number;
    currency?: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    method?: 'card' | 'wallet' | 'cash';
    createdAt?: string;
  };