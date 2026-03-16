export const ORDER_STATUSES = [
  'RECEIVED',
  'CONFIRMED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_FLOW: OrderStatus[] = ['RECEIVED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

export const PAYMENT_METHODS = ['COD', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
