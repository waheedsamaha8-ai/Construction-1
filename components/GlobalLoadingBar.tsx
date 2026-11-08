import React, { useEffect, useState } from 'react';

type LoadingListener = (loading: boolean, progress: number) => void;
const listeners = new Set<LoadingListener>();

const notify = (loading: boolean, progress: number) => {
    listeners.forEach(listener => listener(loading, progress));
};

export const triggerLoadingStart = () => {
    notify(true, 15);
};

export const triggerLoadingStop = () => {
    notify(false, 100);
};

export const triggerLoadingProgress = (percent: number) => {
    notify(true, percent);
};

const GlobalLoadingBar: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: any;

    const handleStateChange = (isLoading: boolean, newProgress: number) => {
        if (isLoading) {
            setLoading(true);
            setProgress(newProgress);
            
            if (newProgress < 100 && newProgress > 0) {
                if (interval) clearInterval(interval);
                interval = setInterval(() => {
                    setProgress(prev => {
                        if (prev >= 92) return prev;
                        return prev + Math.random() * 4;
                    });
                }, 400);
            }
        } else {
            setProgress(100);
            if (interval) clearInterval(interval);
            setTimeout(() => {
                setLoading(false);
                setProgress(0);
            }, 300);
        }
    };

    listeners.add(handleStateChange);

    return () => {
        listeners.delete(handleStateChange);
        if (interval) clearInterval(interval);
    };
  }, []);

  if (!loading) return null;

  const currentPercent = Math.min(Math.round(progress), 100);

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none transition-all duration-300">
      {/* Top Animated Colored Progress Line with Glow */}
      <div className="h-[3.5px] bg-slate-900/40 w-full overflow-hidden relative">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 via-teal-400 to-amber-400 transition-all duration-300 ease-out shadow-[0_0_14px_rgba(59,130,246,0.9)] relative"
          style={{ width: `${currentPercent}%` }}
        >
          {/* Animated Light Shimmer Line */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default GlobalLoadingBar;
