const axios = require('axios');
const crypto = require('crypto');
const Station = require('../models/Station');
const Device = require('../models/Device');
const DeviceData = require('../models/DeviceData');
// 👇 ADD THIS LINE HERE 👇
const weatherService = require('./weatherService');

class SolarmanService {
    constructor() {
        this.token = null;
        this.tokenExpiresAt = 0;
        
        // Create Axios instance
        this.api = axios.create({
            baseURL: process.env.SOLARMAN_BASE_URL,
            timeout: 10000,
        });

        // REQUEST INTERCEPTOR: Inject Token
        this.api.interceptors.request.use(async (config) => {
            // Skip token check for login endpoint
            if (config.url.includes('/account/v1.0/token')) return config;

            // Ensure we have a valid token
            if (!this.token || Date.now() >= this.tokenExpiresAt) {
                console.log('🔄 Token expired or missing. Refreshing...');
                await this.login();
            }

            config.headers['Authorization'] = `Bearer ${this.token}`;
            return config;
        });

        // RESPONSE INTERCEPTOR: Handle 401 (Auth Error) Retry
        this.api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                
                // If 401 Unauthorized and we haven't retried yet
                if (error.response && error.response.status === 401 && !originalRequest._retry) {
                    console.log('⚠️ 401 Error detected. Re-authenticating and retrying...');
                    originalRequest._retry = true;
                    
                    await this.login(); // Force new login
                    
                    originalRequest.headers['Authorization'] = `Bearer ${this.token}`;
                    return this.api(originalRequest);
                }
                return Promise.reject(error);
            }
        );
    }

    // 1. LOGIN / GET TOKEN
    async login() {
        try {
            // Depending on API, password might need SHA256 hashing if not already hashed.
            // Based on your snippet, the password is already hashed string.
            // If the API requires raw password, remove the hashing part or use raw.
            // Assuming the password in .env is the one to send.

            const response = await axios.post(
                `${process.env.SOLARMAN_BASE_URL}/account/v1.0/token?appId=${process.env.SOLARMAN_APP_ID}&language=en`,
                {
                    appSecret: process.env.SOLARMAN_APP_SECRET,
                    email: process.env.SOLARMAN_EMAIL,
                    password: process.env.SOLARMAN_PASSWORD
                }
            );

            if (response.data && response.data.access_token) {
                this.token = response.data.access_token;
                // Set expiry (safety buffer of 5 minutes)
                this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 300000;
                console.log('✅ Auth Successful. Token obtained.');
            } else {
                throw new Error('No access token in response');
            }
        } catch (error) {
            console.error('❌ Login Failed:', error.message);
            throw error;
        }
    }

    // 2. SYNC STATIONS
    async syncStations() {
        try {
            const res = await this.api.post('/station/v1.0/list');
            const stations = res.data.stationList || [];

            console.log(`📡 Found ${stations.length} stations.`);

            for (const st of stations) {
                // Upsert Station (Update if exists, Insert if new)
                await Station.findOneAndUpdate(
                    { id: st.id },
                    st,
                    { upsert: true, new: true }
                );
            }
            return stations;
        } catch (error) {
            console.error('❌ Sync Stations Error:', error.message);
            return [];
        }
    }

    // 3. SYNC DEVICES FOR A STATION
    async syncDevices(stationId) {
        try {
            const res = await this.api.post('/station/v1.0/device', { stationId });
            const devices = res.data.deviceListItems || [];

            console.log(`🔌 Found ${devices.length} devices for Station ${stationId}.`);

            for (const dev of devices) {
                await Device.findOneAndUpdate(
                    { deviceId: dev.deviceId },
                    dev,
                    { upsert: true, new: true }
                );
            }
            return devices;
        } catch (error) {
            console.error(`❌ Sync Devices Error (Station ${stationId}):`, error.message);
            return [];
        }
    }

    // 4. SYNC DEVICE DATA
    async syncCurrentData(deviceSn, deviceId) {
        try {
            console.log(`📊 Fetching data for device: ${deviceSn}`);
            const res = await this.api.post('/device/v1.0/currentData', { deviceSn });
            
            if (!res.data.dataList || res.data.dataList.length === 0) {
                console.log(`⚠️ No data received for ${deviceSn}`);
                return;
            }

            const collectionTime = res.data.collectionTime;
            
            // [NEW] Get Latest Weather ID
            const latestWeatherId = await weatherService.getLatestWeatherId();

            const getValue = (key) => {
                const item = res.data.dataList.find(d => d.key === key);
                return item ? parseFloat(item.value) : 0;
            };

            const dataPayload = {
                deviceSn,
                deviceId, 
                collectionTime,
                weatherDataId: latestWeatherId, // [NEW] Save ID here
                dataList: res.data.dataList,
                acPower: getValue('APo_t1'),
                dailyProduction: getValue('Etdy_ge1'),
                cumulativeProduction: getValue('Et_ge0')
            };

            // Upsert: Update if exists, Insert if new (instead of checking separately)
            const result = await DeviceData.findOneAndUpdate(
                { deviceSn, collectionTime },
                dataPayload,
                { upsert: true, new: true }
            );
            
            console.log(`💾 Device Data saved for ${deviceSn} at ${new Date(collectionTime * 1000).toISOString()} | AC Power: ${dataPayload.acPower}W`);

        } catch (error) {
            console.error(`❌ Sync Data Error (${deviceSn}):`, error.message);
            if (error.response && error.response.data) {
                console.error('   Response Error:', error.response.data);
            }
        }
    }

    // MASTER SYNC FUNCTION
    async runFullSync() {
        console.log('\n--- 🚀 Starting Full Sync ---');
        try {
            const stations = await this.syncStations();
            
            if (stations.length === 0) {
                console.log('⚠️ No stations found');
                return;
            }
            
            for (const station of stations) {
                console.log(`\n📍 Processing Station: ${station.id}`);
                const devices = await this.syncDevices(station.id);
                
                if (devices.length === 0) {
                    console.log(`  └─ No devices in station ${station.id}`);
                    continue;
                }
                
                for (const device of devices) {
                    // Only fetch data for Inverters (or other relevant types)
                    if (device.deviceType === 'INVERTER') {
                        await this.syncCurrentData(device.deviceSn, device.deviceId);
                    } else {
                        console.log(`  ⏭️ Skipping non-inverter device: ${device.deviceSn} (${device.deviceType})`);
                    }
                }
            }
            console.log('--- ✅ Full Sync Complete ---\n');
        } catch (error) {
            console.error('❌ Sync Logic Failed:', error.message);
            console.error(error);
        }
    }
}

module.exports = new SolarmanService();