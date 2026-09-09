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

const WAREHOUSE_FLOW = ['RECEIVED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'] as const;

/** Keep order `status` aligned with last-mile so admin/customer do not stay on RECEIVED after drop. */
export function warehouseStatusForDeliveryStep(
  currentWarehouseStatus: string,
  deliveryStep: string,
): string | undefined {
  if (currentWarehouseStatus === 'CANCELLED' || currentWarehouseStatus === 'DELIVERED') {
    return undefined;
  }
  if (deliveryStep === 'DELIVERED' || deliveryStep === 'CANS_RETURNED') {
    return 'DELIVERED';
  }
  if (deliveryStep === 'PICKED_UP') {
    const i = WAREHOUSE_FLOW.indexOf(currentWarehouseStatus as (typeof WAREHOUSE_FLOW)[number]);
    const dispatched = WAREHOUSE_FLOW.indexOf('DISPATCHED');
    if (i >= 0 && i < dispatched) {
      return 'DISPATCHED';
    }
  }
  return undefined;
}
