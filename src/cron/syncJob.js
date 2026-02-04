const cron = require('node-cron');
const solarmanService = require('../services/solarman');
const weatherService = require('../services/weatherService');

const startScheduler = () => {
    
    // 1. Solarman Sync - Every Minute (* * * * *)
    cron.schedule('*/5 * * * *', async () => {
        console.log(`\n[${new Date().toISOString()}] ⚡ Triggering Solarman Sync...`);
        await solarmanService.runFullSync();
    });

    // 2. OpenWeather Sync - Every 5 Minutes (*/5 * * * *)
    cron.schedule('*/5 * * * *', async () => {
        console.log(`\n[${new Date().toISOString()}] ☁️ Triggering Weather Sync...`);
        await weatherService.fetchAndStoreWeather();
    });

    console.log('✅ Scheduler started: Solar (1m), Weather (5m).');
};

module.exports = startScheduler;