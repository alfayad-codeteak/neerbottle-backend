/** Warehouse / fulfilment status (existing). */
export const ORDER_STATUSES = [
  'RECEIVED',
  'CONFIRMED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;

/** Last-mile / partner tracking (separate from warehouse status). */
export const DELIVERY_STATUSES = ['NONE', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANS_RETURNED'] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const PARTNER_FLOW: DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANS_RETURNED'];

export function nextDeliveryStatus(current: string, next: string): boolean {
  const i = PARTNER_FLOW.indexOf(current as DeliveryStatus);
  const j = PARTNER_FLOW.indexOf(next as DeliveryStatus);
  if (i < 0 || j < 0) return false;
  return j === i + 1;
}
