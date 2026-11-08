
import { useEffect } from 'react';

/**
 * Hook to handle mobile hardware back button.
 * In a SPA, the hardware back button triggers a popstate event.
 * This hook allows components to intercept or respond to this event.
 */
export const useMobileBack = (onBack: () => void, enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handlePopState = (event: PopStateEvent) => {
      // When the back button is pressed, we trigger the callback
      onBack();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBack, enabled]);
};
