import { useEffect, useState } from "react";

/**
 * Returns true after `ms` milliseconds while `active` stays true.
 * Use to switch from a skeleton to a richer "still loading" animation when a
 * request is taking longer than expected (e.g. Render free-tier cold start).
 *
 *   const slow = useSlowFlag(isLoading, 3000);
 *   if (isLoading) return slow ? <Loader/> : <Skeleton/>;
 */
export function useSlowFlag(active: boolean, ms = 3000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}
