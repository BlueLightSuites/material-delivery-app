export type Job = {
    id: string;
    title?: string;
    description?: string;
    pickupLocation: { lat: number; lng: number; address?: string };
    dropoffLocation: { lat: number; lng: number; address?: string };
    price: number;
    status: 'open' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled';
    createdAt: string;
    contractorId?: string;
    driverId?: string;
  };