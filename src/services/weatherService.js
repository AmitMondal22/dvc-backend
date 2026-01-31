const axios = require('axios');
const WeatherData = require('../models/WeatherData');

class WeatherService {
    
    async fetchAndStoreWeather() {
        try {
            // 1. Define the Solar Radiation API URL
            // Docs: https://openweathermap.org/api/solar-radiation
            const url = `https://api.openweathermap.org/data/2.5/solar_radiation`;
            
            const params = {
                lat: process.env.OPENWEATHER_LATITUDE,
                lon: process.env.OPENWEATHER_LONGITUDE,
                appid: process.env.OPENWEATHER_API_KEY,
            };

            // 2. Call the API
            const response = await axios.get(url, { params });
            const data = response.data;
            const now = Math.floor(Date.now() / 1000);

            // 3. Parse Response
            // The structure is typically lists of timestamped data, or a current value.
            // If it returns a list, we take the closest/current one.
            // Assuming the 'current' endpoint returns a direct object:
            
            let ghi = 0;
            let dni = 0;
            let dhi = 0;

            // Handle different API response variations
            if (data.radiation) {
                 // Some versions return just { radiation: 120 }
                if (typeof data.radiation === 'number') {
                    ghi = data.radiation;
                } 
                // Others might return detailed objects
                else if (typeof data.radiation === 'object') {
                    ghi = data.radiation.ghi || 0;
                    dni = data.radiation.dni || 0;
                    dhi = data.radiation.dhi || 0;
                }
            } else if (Array.isArray(data) && data.length > 0) {
                // If it returns an hourly forecast list, take the first (current) item
                ghi = data[0].radiation || 0;
            }

            console.log(`☀️ Solar Radiation Synced: ${ghi} W/m²`);

            // 4. Save to DB
            const weatherEntry = await WeatherData.create({
                location: {
                    lat: params.lat,
                    lon: params.lon
                },
                ghi: ghi, // Global Horizontal Irradiance
                dni: dni,
                dhi: dhi,
                temp: 0, // Not available in this specific endpoint
                clouds: 0, // Not available in this specific endpoint
                rawJson: data,
                timestamp: now
            });

            return weatherEntry;

        } catch (error) {
            console.error('❌ Solar Radiation Sync Error:', error.response ? error.response.data : error.message);
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