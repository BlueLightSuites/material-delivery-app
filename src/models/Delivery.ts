import { Job } from './Job';
import { User } from './User';

export type Delivery = {
  id: string;
  job: Job;
  driver?: User;
  contractor?: User;
  startedAt?: string;
  finishedAt?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
};