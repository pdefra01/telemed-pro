import { User } from '../types';

/**
 * An affiliate is a patient, or an advisor that holds a Medinex plan on the
 * same account. Mirrors public.is_affiliate() in the database.
 */
export const isAffiliate = (user: Pick<User, 'role' | 'planId'> | null | undefined): boolean => {
  if (!user) return false;
  if (user.role === 'patient') return true;
  return user.role === 'advisor' && Boolean(user.planId);
};
