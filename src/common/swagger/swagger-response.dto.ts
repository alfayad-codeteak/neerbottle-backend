import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Standard NestJS HTTP exception body (4xx / 5xx). `message` may be a string or string[] for validation. */
export class ApiErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Bad Request',
    description: 'Human-readable message; validation errors may return an array of strings',
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request', description: 'Error name' })
  error: string;
}

export class ApiUnauthorizedResponseDto {
  @ApiProperty({ example: 401, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Unauthorized',
    description: 'Reason such as invalid credentials, wrong role, or missing/invalid JWT',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unauthorized', description: 'Error name' })
  error: string;
}

export class SuccessWithIdDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'uuid', description: 'Affected entity id' })
  id: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class FeaturesListResponseDto {
  @ApiProperty({
    type: [String],
    example: ['products', 'orders'],
    description: 'Assignable permission keys for admin users',
  })
  features: string[];
}

export class RedisHealthDto {
  @ApiProperty({ description: 'Whether Redis URL is configured' })
  enabled: boolean;

  @ApiPropertyOptional({ example: true, description: 'PING result when enabled' })
  ping: boolean | null;
}

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'AquaFliq Water Ordering API' })
  service: string;

  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: '2026-03-28T12:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 123.45, description: 'Process uptime in seconds' })
  uptime: number;

  @ApiProperty({ type: RedisHealthDto })
  redis: RedisHealthDto;
}

export class PingResponseDto {
  @ApiProperty({ example: true })
  pong: boolean;
}

export class DepositTierDto {
  @ApiProperty({ example: 5, description: 'Minimum total can quantity for this tier' })
  minQty: number;

  @ApiProperty({ example: 10, description: 'Discount percent on deposit in promo window' })
  discountPercent: number;
}

export class DepositPublicConfigResponseDto {
  @ApiProperty({ description: 'Global deposit feature toggle' })
  enabled: boolean;

  @ApiProperty({ example: 150, description: 'Deposit amount per chargeable can (when enabled)' })
  perCanAmount: number;

  @ApiProperty({ description: 'Whether promo window is currently active' })
  promoActive: boolean;

  @ApiPropertyOptional({ nullable: true })
  promoStartsAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  promoEndsAt: string | null;

  @ApiProperty({ type: [DepositTierDto], description: 'Volume discount tiers for deposit' })
  tiers: DepositTierDto[];
}

export class DepositConfigAdminResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  perCanAmount: number;

  @ApiProperty()
  promoActive: boolean;

  @ApiPropertyOptional({ nullable: true })
  promoStartsAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  promoEndsAt: string | null;

  @ApiProperty({ type: [DepositTierDto], description: 'Promo volume tiers (JSON-backed)' })
  tiers: DepositTierDto[];

  @ApiProperty()
  updatedAt: string;
}

export class WalletBalanceResponseDto {
  @ApiProperty({ example: 450.5, description: 'Current deposit wallet balance' })
  balance: number;
}

export class DepositRefundResponseDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty({ description: 'Amount credited back to customer wallet' })
  refundedAmount: number;

  @ApiProperty({ description: 'Customer wallet balance after refund' })
  walletBalance: number;
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;

  @ApiProperty({
    description: 'Per-can deposit when deposits are enabled; 0 when disabled',
  })
  depositPerCan: number;

  @ApiProperty({ description: 'price + depositPerCan (per can)' })
  orderValuePerCan: number;

  @ApiPropertyOptional({ nullable: true })
  photoUrl: string | null;

  @ApiProperty({ type: [String] })
  photoUrls: string[];

  @ApiProperty()
  stock: number;

  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @ApiProperty({ description: 'Admin/catalog only; always true on customer catalog' })
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class BulkProductsUpdateResponseDto {
  @ApiProperty({ description: 'Number of rows updated' })
  count: number;

  @ApiProperty({ type: [ProductResponseDto] })
  products: ProductResponseDto[];
}

export class OrderLineItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty({ description: 'quantity × unitPrice' })
  total: number;
}

export class OrderAddressSnippetDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  label: string | null;

  @ApiProperty()
  line1: string;

  @ApiPropertyOptional({ nullable: true })
  line2: string | null;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional({ nullable: true })
  state: string | null;

  @ApiPropertyOptional({ nullable: true })
  pincode: string | null;
}

export class DeliveryPartnerSnippetDto {
  @ApiProperty({ description: 'DeliveryPartner row id (use for assign API)' })
  id: string;

  @ApiProperty({ description: 'Linked User id' })
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;
}

export class UserSnippetDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;
}

const ORDER_STATUS_ENUM = [
  'RECEIVED',
  'CONFIRMED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;

const DELIVERY_STATUS_ENUM = ['NONE', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANS_RETURNED'] as const;

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  addressId: string;

  @ApiPropertyOptional({ nullable: true, description: 'DeliveryPartner id when assigned' })
  deliveryPartnerId: string | null;

  @ApiPropertyOptional({ nullable: true })
  assignedAt: string | null;

  @ApiProperty({ enum: DELIVERY_STATUS_ENUM, description: 'Last-mile partner workflow' })
  deliveryStatus: string;

  @ApiPropertyOptional({ nullable: true })
  deliveryNotes: string | null;

  @ApiPropertyOptional({ type: DeliveryPartnerSnippetDto, nullable: true })
  deliveryPartner: DeliveryPartnerSnippetDto | null;

  @ApiProperty()
  timeSlot: string;

  @ApiProperty()
  paymentMethod: string;

  @ApiProperty({ enum: ORDER_STATUS_ENUM, description: 'Warehouse / fulfilment status' })
  status: string;

  @ApiProperty({ description: 'Whether this order has can-return flow enabled' })
  ifCanRefund: boolean;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty({ description: 'Deposit base before promo discount' })
  depositBase: number;

  @ApiProperty({ description: 'Promo discount amount on deposit' })
  depositDiscount: number;

  @ApiProperty({ description: 'Final deposit charged on order' })
  depositCharge: number;

  @ApiProperty({ description: 'Whether deposit was refunded (can return)' })
  depositRefunded: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ type: OrderAddressSnippetDto })
  address: OrderAddressSnippetDto;

  @ApiProperty({ type: [OrderLineItemResponseDto] })
  items: OrderLineItemResponseDto[];

  @ApiPropertyOptional({
    type: UserSnippetDto,
    description: 'Included on admin and partner order payloads when applicable',
  })
  user?: UserSnippetDto;
}

export class OrderQuoteResponseDto {
  @ApiProperty({ description: 'Sum of line totals (products only)' })
  itemsSubtotal: number;

  @ApiProperty()
  depositEnabled: boolean;

  @ApiProperty({ description: 'Whether this quote includes can return flow' })
  ifCanRefund: boolean;

  @ApiProperty({ description: 'Total units ordered' })
  quantity: number;

  @ApiProperty({ description: 'Cans customer returns with this order' })
  returnedCanCount: number;

  @ApiProperty({ description: 'Cans used for deposit calculation' })
  chargeableCanCount: number;

  @ApiProperty()
  depositBase: number;

  @ApiProperty()
  depositDiscount: number;

  @ApiProperty()
  depositCharge: number;

  @ApiProperty({ description: 'itemsSubtotal + depositCharge' })
  totalAmount: number;

  @ApiProperty({ description: 'Applied promo discount percent on deposit (0 if none)' })
  discountPercent: number;
}

export class DeliveryPartnerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  vehicleType: string | null;

  @ApiPropertyOptional({ nullable: true })
  vehicleNumber: string | null;

  @ApiProperty({ description: 'Whether partner can take new assignments' })
  isAvailable: boolean;

  @ApiPropertyOptional({ nullable: true })
  currentLat: number | null;

  @ApiPropertyOptional({ nullable: true })
  currentLng: number | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class CustomerListRowDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  orderCount: number;

  @ApiProperty()
  addressCount: number;
}

export class PaginatedCustomersResponseDto {
  @ApiProperty({ type: [CustomerListRowDto] })
  data: CustomerListRowDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1, minimum: 1 })
  page: number;

  @ApiProperty({ example: 20, maximum: 100 })
  limit: number;
}

export class AddressRecordDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  label: string | null;

  @ApiProperty()
  line1: string;

  @ApiPropertyOptional({ nullable: true })
  line2: string | null;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional({ nullable: true })
  state: string | null;

  @ApiPropertyOptional({ nullable: true })
  pincode: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty()
  isDefault: boolean;
}

/** Customer’s own address row (includes timestamps). */
export class MyAddressResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  label: string | null;

  @ApiProperty()
  line1: string;

  @ApiPropertyOptional({ nullable: true })
  line2: string | null;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional({ nullable: true })
  state: string | null;

  @ApiPropertyOptional({ nullable: true })
  pincode: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class CustomerRecentOrderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  timeSlot: string;

  @ApiProperty()
  paymentMethod: string;

  @ApiProperty()
  createdAt: Date;
}

export class AdminUserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty({ example: 'admin' })
  role: string;

  @ApiProperty({ type: [String], example: ['products', 'orders'] })
  permissions: string[];

  @ApiProperty()
  createdAt: string;
}

export class CustomerDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  orderCount: number;

  @ApiProperty({ type: [AddressRecordDto] })
  addresses: AddressRecordDto[];

  @ApiProperty({ type: [CustomerRecentOrderDto] })
  recentOrders: CustomerRecentOrderDto[];
}

/** Register extra models with SwaggerModule.createDocument(..., { extraModels }). */
export const SWAGGER_EXTRA_MODELS = [
  ApiErrorResponseDto,
  ApiUnauthorizedResponseDto,
  SuccessWithIdDto,
  LogoutResponseDto,
  FeaturesListResponseDto,
  AdminUserResponseDto,
  HealthCheckResponseDto,
  PingResponseDto,
  DepositPublicConfigResponseDto,
  DepositConfigAdminResponseDto,
  WalletBalanceResponseDto,
  DepositRefundResponseDto,
  ProductResponseDto,
  BulkProductsUpdateResponseDto,
  OrderLineItemResponseDto,
  OrderAddressSnippetDto,
  DeliveryPartnerSnippetDto,
  UserSnippetDto,
  OrderResponseDto,
  OrderQuoteResponseDto,
  DeliveryPartnerResponseDto,
  CustomerListRowDto,
  PaginatedCustomersResponseDto,
  AddressRecordDto,
  MyAddressResponseDto,
  CustomerRecentOrderDto,
  CustomerDetailResponseDto,
];
