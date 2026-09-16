/**
 * The status vocabulary `delivery_requests.status` actually uses, and how
 * to present it.
 *
 * Not to be confused with the `status` fields on Delivery.ts / Job.ts,
 * which use different words entirely ('scheduled', 'open', 'delivered')
 * and belong to models nothing live imports.
 */

/**
 * The happy path, in order. 'cancelled' is deliberately not here: it's a
 * terminal state reached *off* this path, and putting it in the array
 * would make the progress timeline claim a cancelled request had passed
 * through every earlier step.
 */
export const DELIVERY_STATUS_ORDER = ['pending', 'assigned', 'in_transit', 'completed'] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUS_ORDER)[number] | 'cancelled';

/** Every status a request can hold, for anywhere that needs the full set. */
export const ALL_DELIVERY_STATUSES = [...DELIVERY_STATUS_ORDER, 'cancelled'] as const;

export const isCancelled = (status?: string): boolean => status === 'cancelled';

const LABELS: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const COLORS: Record<DeliveryStatus, string> = {
  pending: '#FFA500',
  assigned: '#0066CC',
  in_transit: '#7C3AED',
  completed: '#10B981',
  cancelled: '#9CA3AF',
};

/** What each step means to the contractor waiting on the delivery. */
const DESCRIPTIONS: Record<DeliveryStatus, string> = {
  pending: 'Waiting for a driver to accept this request.',
  assigned: 'A driver accepted and is heading to the pickup location.',
  in_transit: 'Your materials are on the way to the dropoff location.',
  completed: 'Delivered.',
  cancelled: 'This request was cancelled.',
};

// The column is plain TEXT with no CHECK constraint, so a value outside
// the vocabulary is possible; every lookup below degrades instead of
// throwing.
const isKnown = (status: string): status is DeliveryStatus =>
  (ALL_DELIVERY_STATUSES as readonly string[]).includes(status);

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
export function isStatusReached(
  step: (typeof DELIVERY_STATUS_ORDER)[number],
  current?: string
): boolean {
  // A cancelled request never "reached" anything: the timeline it's
  // shown against is the happy path, and cancellation left it.
  if (!current || !isKnown(current) || current === 'cancelled') {
    return false;
  }
  return (
    DELIVERY_STATUS_ORDER.indexOf(step) <=
    DELIVERY_STATUS_ORDER.indexOf(current as (typeof DELIVERY_STATUS_ORDER)[number])
  );
}
