const mongoose = require('mongoose');

const WeatherDataSchema = new mongoose.Schema({
    location: {
        lat: Number,
        lon: Number
    },
    // Solar Radiation Data
    ghi: { type: Number, default: 0 }, // Global Horizontal Irradiance (kWh/m²)
    dni: { type: Number, default: 0 }, // Direct Normal Irradiance (if available)
    dhi: { type: Number, default: 0 }, // Diffuse Horizontal Irradiance (if available)

    // Weather Data from Daily Forecast
    temp: Number,           // Average temperature (°F)
    tempMax: Number,        // Daily max temperature (°F)
    tempMin: Number,        // Daily min temperature (°F)
    clouds: Number,         // Weather code from Open-Meteo
    
    rawJson: Object,
    timestamp: { type: Number, required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('WeatherData', WeatherDataSchema);