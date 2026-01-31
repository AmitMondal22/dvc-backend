const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
    deviceId: { type: Number, required: true, unique: true },
    deviceSn: { type: String, required: true, unique: true },
    stationId: { type: Number, ref: 'Station' }, // Reference by Solarman ID for simplicity
    deviceType: String,
    connectStatus: Number,
    collectionTime: Number,
}, { timestamps: true });

module.exports = mongoose.model('Device', DeviceSchema);