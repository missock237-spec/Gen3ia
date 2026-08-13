'use client';

import { useState, useEffect } from 'react';
import { SettingsView } from '@/components/settings/settings-view';

export default function DashboardSettingsPage() {
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);

  // Read ?tab=... query param on mount so deep-links like
  // /dashboard/settings?tab=ads work as expected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || undefined;
    if (tab) setInitialTab(tab);
  }, []);

  return <SettingsView initialTab={initialTab} />;
}
