const mongoose = require('mongoose');

const DeviceDataSchema = new mongoose.Schema({
    deviceSn: { type: String, required: true, index: true },
    deviceId: { type: Number }, // Optional link
    collectionTime: { type: Number, required: true },

    // [NEW] Link to the Weather condition at this time
    weatherDataId: { type: mongoose.Schema.Types.ObjectId, ref: 'WeatherData', default: null },
    
    // Store the raw data list or specific parsed fields
    dataList: [{
        key: String,
        name: String,
        value: String,
        unit: String
    }],
    
    // Parsed common fields for easier querying (optional)
    acPower: Number, // APo_t1
    dailyProduction: Number, // Etdy_ge1
    cumulativeProduction: Number // Et_ge0

}, { timestamps: true });

// COMPOUND INDEX: Prevent duplicate entries for the same device at the same time
DeviceDataSchema.index({ deviceSn: 1, collectionTime: 1 }, { unique: true });

module.exports = mongoose.model('DeviceData', DeviceDataSchema);