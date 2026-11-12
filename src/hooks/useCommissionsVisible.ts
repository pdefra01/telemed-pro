import { useEffect, useState } from 'react';
import { commissionRepository } from '../repositories/CommissionRepository';

/**
 * Whether advisors and supervisors may see commissions (the switch in Configuración).
 * null while it loads; a switch that cannot be read counts as off. With `enabled`
 * false (e.g. the admin, who always sees them) nothing is read and the hook answers false.
 */
export function useCommissionsVisible(enabled = true): boolean | null {
  const [visible, setVisible] = useState<boolean | null>(enabled ? null : false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    setVisible(null);
    commissionRepository
      .isVisible()
      .then((value) => { if (!cancelled) setVisible(value); })
      .catch(() => { if (!cancelled) setVisible(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return visible;
}
