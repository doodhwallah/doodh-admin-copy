import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/utils';

/**
 * Hook that ensures all active employees have attendance records for today.
 * Employees are marked as "present" by default unless manually changed.
 */
export function useAutoAttendance() {
  useEffect(() => {
    const ensureTodayAttendance = async () => {
      try {
        await supabase.rpc('auto_create_daily_attendance');
      } catch (error) {
        devError('Auto attendance sync failed:', error);
      }
    };

    ensureTodayAttendance();
  }, []);
}
