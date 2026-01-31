const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // Solarman Station ID
    name: String,
    type: String,
    locationLat: Number,
    locationLng: Number,
    locationAddress: String,
    regionTimezone: String,
    installedCapacity: Number,
    lastUpdateTime: Number,
    stationImage: String,
    // Add other fields as needed based on API response
}, { timestamps: true });

module.exports = mongoose.model('Station', StationSchema);