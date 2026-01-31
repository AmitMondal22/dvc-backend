const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const Station = require('../models/Station');
const Device = require('../models/Device');
const DeviceData = require('../models/DeviceData');
const WeatherData = require('../models/WeatherData');

// ==========================================
// 1. DASHBOARD STATS
// ==========================================
router.get('/dashboard-stats', protect, async (req, res) => {
    try {
        const totalStations = await Station.countDocuments();
        const totalDevices = await Device.countDocuments({ deviceType: 'INVERTER' });
        
        // Calculate Total Capacity
        const stations = await Station.find();
        const totalCapacity = stations.reduce((acc, curr) => acc + (curr.installedCapacity || 0), 0);

        // Get Latest Global Weather (Solar Radiation)
        const weather = await WeatherData.findOne().sort({ timestamp: -1 });

        res.json({
            totalStations,
            totalDevices,
            totalCapacity,
            currentGHI: weather ? weather.ghi : 0,
            currentTemp: weather ? weather.temp : 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 2. GET STATIONS
// ==========================================
router.get('/stations', protect, async (req, res) => {
    try {
        const stations = await Station.find().sort({ id: 1 });
        res.json(stations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 3. GET DEVICES (With Station Info)
// ==========================================
router.get('/devices', protect, async (req, res) => {
    try {
        const devices = await Device.aggregate([
            {
                $lookup: {
                    from: 'stations',       // The MongoDB collection name for stations
                    localField: 'stationId', // The field in Device model
                    foreignField: 'id',      // The field in Station model (Solarman ID)
                    as: 'station'            // The name of the new field to add
                }
            },
            { 
                $unwind: { 
                    path: '$station', 
                    preserveNullAndEmptyArrays: true // Keep device even if station not found
                } 
            },
            // We removed the $project stage so ALL data is returned
        ]);

        res.json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 4. DEVICE LIVE DATA (Full dataList + Weather)
// ==========================================
router.get('/device/:deviceSn/latest', protect, async (req, res) => {
    try {
        const { deviceSn } = req.params;

        // A. Find Device
        const device = await Device.findOne({ deviceSn });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        // B. Find Station
        const station = await Station.findOne({ id: device.stationId });

        // C. Find Last Data (Sort Descending by Time)
        const lastData = await DeviceData.findOne({ deviceSn })
            .sort({ collectionTime: -1 })
            .populate('weatherDataId');

        res.json({
            device: {
                sn: device.deviceSn,
                type: device.deviceType,
                status: device.connectStatus,
                updatedAt: device.updatedAt
            },
            station: station ? {
                id: station.id,
                name: station.name,
                location: station.locationAddress,
            } : null,
            data: lastData ? {
                collectionTime: lastData.collectionTime,
                readableTime: new Date(lastData.collectionTime * 1000).toLocaleString(),
                
                // ✅ KEY FIX: Sending the full raw list (Voltages, Currents, etc.)
                parameters: lastData.dataList, 

                // Weather Info
                weather: lastData.weatherDataId ? {
                    ghi: lastData.weatherDataId.ghi,
                    dni: lastData.weatherDataId.dni,
                    dhi: lastData.weatherDataId.dhi
                } : null
            } : null
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 5. DEVICE REPORT (Full History + All Params)
// ==========================================
router.get('/report', protect, async (req, res) => {
    try {
        const { deviceSn, fromDate, toDate } = req.query;

        if (!deviceSn || !fromDate || !toDate) {
            return res.status(400).json({ message: 'Missing params: deviceSn, fromDate, toDate' });
        }

        // ✅ FIX: Set time to Start of Day (00:00:00) and End of Day (23:59:59)
        // Incoming format: "2026-01-30"
        const start = new Date(`${fromDate}T00:00:00.000Z`).getTime() / 1000;
        const end = new Date(`${toDate}T23:59:59.999Z`).getTime() / 1000;

        console.log(`Searching Data for ${deviceSn} between ${start} and ${end}`);

        const data = await DeviceData.find({
            deviceSn: deviceSn,
            collectionTime: { $gte: start, $lte: end }
        })
        .sort({ collectionTime: 1 }) // Chronological order
        .populate('weatherDataId')
        .lean(); // Faster query

        // ✅ FIX: Return full structure for every point in time
        const formattedData = data.map(record => ({
            timestamp: record.collectionTime,
            time: new Date(record.collectionTime * 1000).toISOString(),
            
            // Full Raw Data (All Voltages, Currents, Frequencies)
            parameters: record.dataList,

            // Linked Weather Data
            weather: record.weatherDataId ? {
                ghi: record.weatherDataId.ghi,
                dni: record.weatherDataId.dni
            } : { ghi: 0, dni: 0 }
        }));

        res.json({
            deviceSn,
            range: { from: fromDate, to: toDate },
            count: formattedData.length,
            data: formattedData
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;