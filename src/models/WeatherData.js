const mongoose = require('mongoose');

const WeatherDataSchema = new mongoose.Schema({
    location: {
        lat: Number,
        lon: Number
    },
    // Solar Radiation Data (W/m²)
    ghi: { type: Number, default: 0 }, // Global Horizontal Irradiance
    dni: { type: Number, default: 0 }, // Direct Normal Irradiance (if available)
    dhi: { type: Number, default: 0 }, // Diffuse Horizontal Irradiance (if available)

    // Fallback/Standard Weather Data (Optional, if you merge calls)
    temp: Number,       
    clouds: Number,     
    
    rawJson: Object,
    timestamp: { type: Number, required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('WeatherData', WeatherDataSchema);