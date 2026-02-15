import { useState, useEffect } from 'react';

type GpsStatus = 'pending' | 'captured' | 'denied' | 'unavailable';
type WeatherStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsStatus: GpsStatus;
  weatherStatus: WeatherStatus;
}

// Module-level cache to avoid refetching on every page navigation
let cachedData: WeatherData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function useWeather(): WeatherData {
  const [data, setData] = useState<WeatherData>(
    cachedData && Date.now() - cacheTimestamp < CACHE_DURATION_MS
      ? cachedData
      : {
          temperature: null,
          humidity: null,
          gpsLat: null,
          gpsLng: null,
          gpsStatus: 'pending',
          weatherStatus: 'idle',
        }
  );

  useEffect(() => {
    // Return cached data if fresh
    if (cachedData && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
      setData(cachedData);
      return;
    }

    if (!navigator.geolocation) {
      const d = { ...data, gpsStatus: 'unavailable' as GpsStatus };
      setData(d);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setData((prev) => ({ ...prev, gpsLat: lat, gpsLng: lng, gpsStatus: 'captured', weatherStatus: 'loading' }));

        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m`
        )
          .then((res) => res.json())
          .then((json) => {
            const result: WeatherData = {
              temperature: json.current.temperature_2m,
              humidity: json.current.relative_humidity_2m,
              gpsLat: lat,
              gpsLng: lng,
              gpsStatus: 'captured',
              weatherStatus: 'loaded',
            };
            cachedData = result;
            cacheTimestamp = Date.now();
            setData(result);
          })
          .catch(() => {
            setData((prev) => ({ ...prev, weatherStatus: 'error' }));
          });
      },
      (err) => {
        const status: GpsStatus = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        setData((prev) => ({ ...prev, gpsStatus: status }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []); // Run once on mount

  return data;
}
