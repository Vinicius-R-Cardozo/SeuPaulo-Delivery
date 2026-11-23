import type { Profile, Role } from '@/types';

export function hasRole(profile: Profile, role: Role) {
  return profile.role === role ||
    (role === 'customer' && profile.role === 'driver' && profile.customerEnabled === true) ||
    (role === 'driver' && profile.role === 'customer' && profile.driverEnabled === true);
}
