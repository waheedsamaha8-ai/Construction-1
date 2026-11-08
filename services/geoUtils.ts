
export interface GeoData {
  lat: number;
  lng: number;
  address: string;
  temperature?: number;
  weatherDesc?: string;
  timestamp: string;
}

// Simple cache for geocoding to avoid rate limits
const geoCache: Record<string, { lat: number; lng: number }> = {
    'العاصمة الإدارية': { lat: 30.0131, lng: 31.7327 },
    'القاهرة': { lat: 30.0444, lng: 31.2357 },
    'المعادي': { lat: 29.9602, lng: 31.2569 },
    'التجمع': { lat: 30.0264, lng: 31.4727 },
    '6 أكتوبر': { lat: 29.9361, lng: 30.9269 },
    'الجيزة': { lat: 30.0131, lng: 31.2089 },
    'الاسكندرية': { lat: 31.2001, lng: 29.9187 },
    'default': { lat: 30.0444, lng: 31.2357 } // Cairo Center default
};

export const geoUtils = {
  getCurrentPosition: (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });
  },

  getWeather: async (lat: number, lng: number): Promise<{ temp: number, desc: string } | null> => {
    try {
      // Free OpenMeteo API (No Key Required)
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
      const data = await res.json();
      
      const weatherCodes: Record<number, string> = {
        0: 'سماء صافية', 1: 'غائم جزئياً', 2: 'غائم جزئياً', 3: 'غائم',
        45: 'ضباب', 48: 'ضباب', 51: 'رذاذ خفيف', 61: 'مطر خفيف',
        63: 'مطر متوسط', 65: 'مطر غزير', 80: 'زخات مطر', 95: 'عاصفة رعدية'
      };

      return {
        temp: data.current_weather.temperature,
        desc: weatherCodes[data.current_weather.weathercode] || 'اعتيادي'
      };
    } catch (e) {
      console.error("Weather fetch failed", e);
      return null;
    }
  },

  getAddress: async (lat: number, lng: number): Promise<string> => {
    try {
      // Free Nominatim API (OpenStreetMap) - Rate limited, use responsibly
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept_language=ar`);
      const data = await res.json();
      return data.address.suburb || data.address.city || data.address.town || data.address.state || "موقع غير معروف";
    } catch (e) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  },

  // NEW: Get Coordinates from Address String (Mock + Fetch)
  getCoordinatesFromAddress: async (address: string): Promise<{ lat: number; lng: number }> => {
      // 1. Clean string
      const cleanAddr = address.trim();
      
      // 2. Check simple keyword cache first
      for (const key in geoCache) {
          if (cleanAddr.includes(key) || key.includes(cleanAddr)) {
              // Add small random jitter so pins don't overlap exactly if they are in the same city
              const jitterLat = (Math.random() - 0.5) * 0.01;
              const jitterLng = (Math.random() - 0.5) * 0.01;
              return { 
                  lat: geoCache[key].lat + jitterLat, 
                  lng: geoCache[key].lng + jitterLng 
              };
          }
      }

      // 3. Try Fetching from Nominatim (limit calls)
      try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr + ', Egypt')}&limit=1`);
          const data = await res.json();
          if (data && data.length > 0) {
              return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          }
      } catch(e) {
          console.warn("Geocoding failed", e);
      }

      // 4. Default Fallback
      return geoCache['default'];
  },

  async getFullContext(): Promise<GeoData> {
    const pos = await this.getCurrentPosition();
    const { latitude, longitude } = pos.coords;
    
    // Parallel fetching
    const [weather, address] = await Promise.all([
        this.getWeather(latitude, longitude),
        this.getAddress(latitude, longitude)
    ]);

    return {
      lat: latitude,
      lng: longitude,
      address: address,
      temperature: weather?.temp,
      weatherDesc: weather?.desc,
      timestamp: new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' })
    };
  }
};
