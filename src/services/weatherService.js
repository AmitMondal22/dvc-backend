const axios = require('axios');
const WeatherData = require('../models/WeatherData');

class WeatherService {
    
    async fetchAndStoreWeather() {
        try {
            // 1. Define the Forecast API URL with Daily Weather & Radiation
            // Docs: https://open-meteo.com/en/docs/forecast-api
            const url = `https://api.open-meteo.com/v1/forecast`;
            
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

            const params = {
                latitude: process.env.OPENWEATHER_LATITUDE || 40.7128,
                longitude: process.env.OPENWEATHER_LONGITUDE || -74.0060,
                daily: 'weather_code,temperature_2m_max,temperature_2m_min,shortwave_radiation_sum',
                timezone: 'America/New_York',
                wind_speed_unit: 'mph',
                temperature_unit: 'fahrenheit',
                precipitation_unit: 'inch',
                start_date: today,
                end_date: tomorrow
            };

            // 2. Call the API
            const response = await axios.get(url, { params });
            const data = response.data;
            const now = Math.floor(Date.now() / 1000);

            // 3. Parse Response
            let ghi = 0;
            let tempMax = 0;
            let tempMin = 0;
            let weatherCode = 0;

            // Handle Open-Meteo Daily Forecast API response
            if (data.daily) {
                ghi = data.daily.shortwave_radiation_sum && data.daily.shortwave_radiation_sum[0] 
                    ? parseFloat(data.daily.shortwave_radiation_sum[0]) 
                    : 0;  // Daily GHI (Shortwave Radiation Sum in MJ/m²)
                tempMax = data.daily.temperature_2m_max && data.daily.temperature_2m_max[0] 
                    ? parseFloat(data.daily.temperature_2m_max[0]) 
                    : 0;
                tempMin = data.daily.temperature_2m_min && data.daily.temperature_2m_min[0] 
                    ? parseFloat(data.daily.temperature_2m_min[0]) 
                    : 0;
                weatherCode = data.daily.weather_code && data.daily.weather_code[0] 
                    ? parseInt(data.daily.weather_code[0]) 
                    : 0;
            }

            console.log(`☀️ GHI (Shortwave Radiation) Synced: ${ghi} kWh/m² | Temp: ${tempMin}°F - ${tempMax}°F | Code: ${weatherCode}`);

            // 4. Save to DB
            const weatherEntry = await WeatherData.create({
                location: {
                    lat: params.latitude,
                    lon: params.longitude
                },
                ghi: ghi, // Global Horizontal Irradiance (kWh/m²)
                temp: (tempMax + tempMin) / 2, // Average temperature
                clouds: weatherCode, // Store weather code as reference
                tempMax: tempMax,
                tempMin: tempMin,
                rawJson: data,
                timestamp: now
            });

            return weatherEntry;

        } catch (error) {
            console.error('❌ Weather Data Sync Error:', error.response ? error.response.data : error.message);
            // Fallback: Return null so the app doesn't crash
            return null;
        }
    }

    async getLatestWeatherId() {
        try {
            const latest = await WeatherData.findOne().sort({ timestamp: -1 });
            return latest ? latest._id : null;
        } catch (error) {
            return null;
        }
    }
}

module.exports = new WeatherService();