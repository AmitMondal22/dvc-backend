const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // Solarman Station ID
    name: String,
    type: String,
    locationLat: Number,
    locationLng: Number,
    locationAddress: String,
    regionTimezone: String,
    installedCapacity: { type: Number, required: false }, // DC Capacity in kWp (primary)
    capacity: { type: Number, required: false }, // Alternate capacity field
    ratedCapacity: { type: Number, required: false }, // Rated capacity field
    peakCapacity: { type: Number, required: false }, // Peak capacity field
    acCapacity: { type: Number, required: false }, // AC side capacity
    lastUpdateTime: Number,
    stationImage: String,
    // Additional fields for better tracking
    status: { type: String, default: 'active' }, // active, inactive, maintenance
    commissionDate: Date,
    // Add other fields as needed based on API response
}, { timestamps: true });

// Index for faster queries
StationSchema.index({ id: 1 });
StationSchema.index({ name: 1 });

module.exports = mongoose.model('Station', StationSchema);