/**
 * The status vocabulary `delivery_requests.status` actually uses, and how
 * to present it.
 *
 * Not to be confused with the `status` fields on Delivery.ts / Job.ts,
 * which use different words entirely ('scheduled', 'open', 'delivered')
 * and belong to models nothing live imports.
 */
export const DELIVERY_STATUS_ORDER = ['pending', 'assigned', 'in_transit', 'completed'] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUS_ORDER)[number];

const LABELS: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_transit: 'In Transit',
  completed: 'Completed',
};

const COLORS: Record<DeliveryStatus, string> = {
  pending: '#FFA500',
  assigned: '#0066CC',
  in_transit: '#7C3AED',
  completed: '#10B981',
};

/** What each step means to the contractor waiting on the delivery. */
const DESCRIPTIONS: Record<DeliveryStatus, string> = {
  pending: 'Waiting for a driver to accept this request.',
  assigned: 'A driver accepted and is heading to the pickup location.',
  in_transit: 'Your materials are on the way to the dropoff location.',
  completed: 'Delivered.',
};

// The column is plain TEXT with no CHECK constraint, so a value outside
// the vocabulary is possible; every lookup below degrades instead of
// throwing.
const isKnown = (status: string): status is DeliveryStatus =>
  (DELIVERY_STATUS_ORDER as readonly string[]).includes(status);

export const statusLabel = (status?: string): string =>
  status && isKnown(status) ? LABELS[status] : 'Unknown';

export const statusColor = (status?: string): string =>
  status && isKnown(status) ? COLORS[status] : '#999999';

export const statusDescription = (status?: string): string =>
  status && isKnown(status) ? DESCRIPTIONS[status] : '';

/**
 * Whether `step` has been reached by a request currently at `current`.
 * An unrecognised current status counts as reaching nothing, so a
 * timeline renders as entirely upcoming rather than entirely done.
 */
export function isStatusReached(step: DeliveryStatus, current?: string): boolean {
  if (!current || !isKnown(current)) {
    return false;
  }
  return DELIVERY_STATUS_ORDER.indexOf(step) <= DELIVERY_STATUS_ORDER.indexOf(current);
}
