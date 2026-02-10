const axios = require('axios');
const WeatherData = require('../models/WeatherData');

class WeatherService {
    
    async fetchAndStoreWeather() {
        try {
            // 1. Define the Forecast API URL with Current Shortwave Radiation
            // Docs: https://open-meteo.com/en/docs/forecast-api
            const url = `https://api.open-meteo.com/v1/forecast`;

            const params = {
                latitude: process.env.OPENWEATHER_LATITUDE || 40.7128,
                longitude: process.env.OPENWEATHER_LONGITUDE || -74.0060,
                current: 'shortwave_radiation',
                timezone: 'Asia/Kolkata'
            };

            // 2. Call the API
            const response = await axios.get(url, { params });
            const data = response.data;
            const now = Math.floor(Date.now() / 1000);

            // 3. Parse Response - Extract current shortwave_radiation as GHI
            let ghi = 0;

            // Handle Open-Meteo Current API response
            if (data.current && data.current.shortwave_radiation !== undefined) {
                ghi = parseFloat(data.current.shortwave_radiation);  // Current GHI (Shortwave Radiation in W/m²)
            }

            console.log(`☀️ GHI (Shortwave Radiation) Synced: ${ghi} W/m² | Latitude: ${params.latitude} | Longitude: ${params.longitude}`);

            // 4. Save to DB
            const weatherEntry = await WeatherData.create({
                location: {
                    lat: params.latitude,
                    lon: params.longitude
                },
                ghi: ghi, // Global Horizontal Irradiance (W/m²)
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