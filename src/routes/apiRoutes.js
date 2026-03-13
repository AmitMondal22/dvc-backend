const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const Station = require('../models/Station');
const Device = require('../models/Device');
const DeviceData = require('../models/DeviceData');
const WeatherData = require('../models/WeatherData');
const SolarCalculation = require('../services/solarCalculation');

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
                $match: { deviceType: 'INVERTER' }
            },
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
                id: device.deviceId,
                sn: device.deviceSn,
                type: device.deviceType,
                status: device.connectStatus,
                updatedAt: device.updatedAt
            },
            station: station ? {
                id: station.id,
                name: station.name,
                location: station.locationAddress,
                lat: station.locationLat,
                lng: station.locationLng,
                installedCapacity: station.installedCapacity || station.capacity || 0,
                type: station.type || 'N/A',
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

// ==========================================
// 6. SOLAR ENERGY METRICS (PR & CUF)
// ==========================================
router.get('/device/:deviceId/solar-metrics', protect, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { fromDate, toDate, tiltAngle = 18, diffuseFraction = 0.2, albedo = 0.2, capacity = null } = req.query;

        // A. Find Device by ID
        const device = await Device.findOne({ deviceId: parseInt(deviceId) });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        // B. Find Station and resolve capacity with multiple fallback logic
        let station = null;
        let dcCapacity = 0;
        let capacitySource = 'unknown';

        // Parse manual capacity if provided (override)
        if (capacity && parseFloat(capacity) > 0) {
            dcCapacity = parseFloat(capacity);
            capacitySource = 'manual_param';
        }

        // Try to find station by stationId
        if (!dcCapacity && device.stationId) {
            station = await Station.findOne({ id: device.stationId });
            
            if (station) {
                // Resolve capacity from multiple sources with priority order
                if (station.installedCapacity && station.installedCapacity > 0) {
                    dcCapacity = station.installedCapacity;
                    capacitySource = 'station.installedCapacity';
                } else if (station.capacity && station.capacity > 0) {
                    dcCapacity = station.capacity;
                    capacitySource = 'station.capacity';
                } else if (station.ratedCapacity && station.ratedCapacity > 0) {
                    dcCapacity = station.ratedCapacity;
                    capacitySource = 'station.ratedCapacity';
                } else if (station.peakCapacity && station.peakCapacity > 0) {
                    dcCapacity = station.peakCapacity;
                    capacitySource = 'station.peakCapacity';
                } else if (station.acCapacity && station.acCapacity > 0) {
                    dcCapacity = station.acCapacity;
                    capacitySource = 'station.acCapacity';
                }
            }
        }

        // If still no capacity found, return detailed diagnostic error
        if (!dcCapacity || dcCapacity <= 0) {
            const stationList = station ? {
                found: true,
                id: station.id,
                name: station.name,
                allFields: {
                    installedCapacity: station.installedCapacity || 'not set',
                    capacity: station.capacity || 'not set',
                    ratedCapacity: station.ratedCapacity || 'not set',
                    peakCapacity: station.peakCapacity || 'not set',
                    acCapacity: station.acCapacity || 'not set'
                }
            } : {
                found: false,
                searchedById: device.stationId,
                availableStations: await Station.find({}, 'id name installedCapacity capacity').limit(5)
            };

            return res.status(400).json({
                message: 'Station or capacity data not found',
                error: {
                    deviceId: device.deviceId,
                    stationId: device.stationId,
                    station: stationList
                },
                solutions: [
                    '1. Add capacity to Station: db.stations.updateOne({id:' + device.stationId + '}, {$set:{installedCapacity:10.355}})',
                    '2. Pass capacity as query param: ?capacity=10.355',
                    '3. Verify device.stationId is set correctly'
                ]
            });
        }

        // C. Query device data based on date range
        let query = { deviceSn: device.deviceSn };
        let days = 1;

        if (fromDate && toDate) {
            const start = new Date(`${fromDate}T00:00:00.000Z`).getTime() / 1000;
            const end = new Date(`${toDate}T23:59:59.999Z`).getTime() / 1000;
            query.collectionTime = { $gte: start, $lte: end };
            
            // Calculate days between dates
            const dateStart = new Date(fromDate);
            const dateEnd = new Date(toDate);
            days = Math.ceil((dateEnd - dateStart) / (1000 * 60 * 60 * 24)) + 1;
        } else {
            // Default to today
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000;
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime() / 1000 - 1;
            query.collectionTime = { $gte: start, $lte: end };
        }

        // D. Get device data
        const deviceDataRecords = await DeviceData.find(query)
            .populate('weatherDataId')
            .sort({ collectionTime: 1 });

        if (deviceDataRecords.length === 0) {
            return res.status(404).json({ message: 'No device data found for the specified period' });
        }

        // E. Aggregate data
        let totalACEnergy = 0;
        let totalGHI = 0;
        let dataCount = 0;
        let latestDailyProduction = 0;
        let latestCumulativeProduction = 0;

        const detailedData = deviceDataRecords.map(record => {
            const acEnergy = SolarCalculation.extractACEnergy(record.dataList);
            const ghi = record.weatherDataId ? record.weatherDataId.ghi : 0;
            const dailyProd = SolarCalculation.extractDailyProduction(record.dataList);
            const cumulativeProd = SolarCalculation.extractCumulativeEnergy(record.dataList);

            totalACEnergy += acEnergy;
            totalGHI += ghi;
            dataCount++;

            // Track latest non-zero values
            if (dailyProd > 0) latestDailyProduction = dailyProd;
            if (cumulativeProd > 0) latestCumulativeProduction = cumulativeProd;

            return {
                timestamp: new Date(record.collectionTime * 1000).toISOString(),
                acEnergy,
                ghi,
                dailyProduction: dailyProd,
                weather: record.weatherDataId ? {
                    temp: record.weatherDataId.temp,
                    clouds: record.weatherDataId.clouds
                } : null
            };
        });

        // F. Calculate GHI average
        const avgGHI = totalGHI / dataCount;
        
        // Use daily production (Eac) for PR calculation
        const eacForPR = latestDailyProduction > 0 ? latestDailyProduction : totalACEnergy;

        // Use daily production for CUF calculation (not cumulative lifetime energy)
        const dailyEnergyForCUF = latestDailyProduction > 0 ? latestDailyProduction : totalACEnergy;

        // G. Calculate PR and CUF using correct values
        const calculation = SolarCalculation.calculateDaily({
            acEnergy: eacForPR,
            dcCapacity: dcCapacity,
            ghi: avgGHI,
            totalEnergy: dailyEnergyForCUF,
            days: days,
            tiltAngle: parseFloat(tiltAngle),
            diffuseFraction: parseFloat(diffuseFraction),
            albedo: parseFloat(albedo)
        });

        if (!calculation.success) {
            return res.status(400).json({ message: calculation.error });
        }

        // H. Return comprehensive response
        res.json({
            device: {
                id: device.deviceId,
                sn: device.deviceSn,
                type: device.deviceType
            },
            station: station ? {
                id: station.id,
                name: station.name,
                location: station.locationAddress,
                installedCapacity: dcCapacity,
                capacitySource: capacitySource,
                unit: 'kWp'
            } : {
                id: device.stationId,
                name: 'Unknown Station',
                location: 'Not Available',
                installedCapacity: dcCapacity,
                capacitySource: capacitySource,
                unit: 'kWp',
                warning: 'Station details not found, only capacity available'
            },
            period: {
                from: fromDate || new Date().toISOString().split('T')[0],
                to: toDate || new Date().toISOString().split('T')[0],
                days: days,
                dataPoints: dataCount
            },
            aggregatedData: {
                totalACEnergy: Number(totalACEnergy.toFixed(2)),
                dailyProduction: Number(eacForPR.toFixed(2)),
                totalEnergy: Number(dailyEnergyForCUF.toFixed(2)),
                averageGHI: Number(avgGHI.toFixed(4)),
                unit: 'kWh, kWh/m²'
            },
            calculations: calculation.data.irradiance,
            results: {
                performanceRatio: {
                    value: calculation.data.performance.performanceRatio,
                    referenceYield: calculation.data.performance.referenceYield,
                    finalYield: calculation.data.performance.finalYield,
                    unit: '%',
                    description: 'Daily Performance Ratio (Yf/Yr x 100)'
                },
                capacityUtilizationFactor: {
                    value: calculation.data.utilization.cuf,
                    totalEnergy: calculation.data.utilization.totalEnergy,
                    hourAvailable: calculation.data.utilization.hourAvailable,
                    unit: '%',
                    description: 'CUF = ActualEnergy / (TotalHours x PlantCapacity) x 100'
                }
            },
            detailedTimeSeries: detailedData,
            calculatedAt: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// 7. DIAGNOSTIC - Check Device & Station Data
// ==========================================
router.get('/device/:deviceId/capacity-info', protect, async (req, res) => {
    try {
        const { deviceId } = req.params;

        // Find Device
        const device = await Device.findOne({ deviceId: parseInt(deviceId) });
        if (!device) return res.status(404).json({ message: 'Device not found' });

        // Find Station - try both ID and stationId field
        let station = null;
        if (device.stationId) {
            station = await Station.findOne({ id: device.stationId });
        } else {
            // Try to find first available station
            station = await Station.findOne().limit(1);
        }

        // Resolve capacity with detailed source tracking
        let dcCapacity = 0;
        let capacitySource = 'not_found';
        let capacityDetails = {};

        if (station) {
            capacityDetails = {
                installedCapacity: station.installedCapacity || null,
                capacity: station.capacity || null,
                ratedCapacity: station.ratedCapacity || null,
                peakCapacity: station.peakCapacity || null,
                acCapacity: station.acCapacity || null
            };

            if (station.installedCapacity && station.installedCapacity > 0) {
                dcCapacity = station.installedCapacity;
                capacitySource = 'installedCapacity ✓';
            } else if (station.capacity && station.capacity > 0) {
                dcCapacity = station.capacity;
                capacitySource = 'capacity ✓';
            } else if (station.ratedCapacity && station.ratedCapacity > 0) {
                dcCapacity = station.ratedCapacity;
                capacitySource = 'ratedCapacity ✓';
            } else if (station.peakCapacity && station.peakCapacity > 0) {
                dcCapacity = station.peakCapacity;
                capacitySource = 'peakCapacity ✓';
            } else if (station.acCapacity && station.acCapacity > 0) {
                dcCapacity = station.acCapacity;
                capacitySource = 'acCapacity ✓';
            } else {
                capacitySource = 'all_fields_empty ✗';
            }
        }

        // Get all stations for reference
        const allStations = await Station.find({}, 'id name installedCapacity capacity').limit(10);

        // Return diagnostics
        res.json({
            status: dcCapacity > 0 ? 'OK' : 'ERROR',
            device: {
                deviceId: device.deviceId,
                deviceSn: device.deviceSn,
                stationId: device.stationId || 'not_set',
                type: device.deviceType,
                connectStatus: device.connectStatus
            },
            station: station ? {
                found: true,
                id: station.id,
                name: station.name,
                locationAddress: station.locationAddress,
                capacityFields: capacityDetails
            } : {
                found: false,
                searchedFor: { id: device.stationId },
                availableStations: allStations.map(s => ({
                    id: s.id,
                    name: s.name,
                    installedCapacity: s.installedCapacity,
                    capacity: s.capacity
                }))
            },
            resolvedCapacity: {
                value: dcCapacity > 0 ? dcCapacity : 'not_found',
                source: capacitySource,
                isValid: dcCapacity > 0,
                unit: 'kWp'
            },
            troubleshooting: {
                issue: dcCapacity > 0 ? null : 'No valid capacity found',
                solutions: dcCapacity > 0 ? [
                    '✅ Capacity is properly configured',
                    '✅ Solar metrics API should work'
                ] : [
                    '1️⃣ Ensure device.stationId is set: db.devices.updateOne({deviceId:' + device.deviceId + '}, {$set:{stationId:<station_id>}})',
                    '2️⃣ Ensure Station exists: db.stations.findOne({id:<station_id>})',
                    '3️⃣ Add capacity to Station: db.stations.updateOne({id:<station_id>}, {$set:{installedCapacity:10.355}})',
                    '4️⃣ Or pass capacity as query param in metrics API: ?capacity=10.355'
                ]
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;