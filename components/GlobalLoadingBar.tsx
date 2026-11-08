
import React, { useEffect, useState } from 'react';

// Simple Observer Pattern to avoid window.dispatchEvent overhead
type LoadingListener = (loading: boolean, progress: number) => void;
const listeners = new Set<LoadingListener>();

const notify = (loading: boolean, progress: number) => {
    listeners.forEach(listener => listener(loading, progress));
};

export const triggerLoadingStart = () => {
    notify(true, 10);
    // Auto increment simulation handled in component
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
            
            // If starting (low progress), simulate increment
            if (newProgress < 100 && newProgress > 0) {
                if (interval) clearInterval(interval);
                interval = setInterval(() => {
                    setProgress(prev => {
                        if (prev >= 90) return prev;
                        return prev + Math.random() * 5;
                    });
                }, 500);
            }
        } else {
            // Stopping
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

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none">
      <div 
        className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
        style={{ width: `${progress}%` }}
      ></div>
      <div className="absolute top-1 right-1">
         <i className="fa-solid fa-circle-notch fa-spin text-blue-600 text-[10px]"></i>
      </div>
    </div>
  );
};

export default GlobalLoadingBar;
