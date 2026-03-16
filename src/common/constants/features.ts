/** Feature keys that can be assigned to admins. Owner has access to all. */
export const FEATURES = [
  'products',
  'orders',
  'addresses',
  'customers',
  'dashboard',
  'reports',
] as const;

export type FeatureKey = (typeof FEATURES)[number];

export function isValidFeature(key: string): key is FeatureKey {
  return (FEATURES as readonly string[]).includes(key);
}
