require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const seedAdmin = require('./src/seed/seedUser');
const startScheduler = require('./src/cron/syncJob');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const apiRoutes = require('./src/routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Connect DB & Seed Admin
connectDB().then(async () => {
    await seedAdmin(); // Creates admin@dbc.in if missing
});

// 2. Middleware
app.use(cors()); // Allow frontend access
app.use(express.json());

// 3. Register Routes
app.use('/api/auth', authRoutes); // Login
app.use('/api', apiRoutes);       // Dashboard & Reports

// 4. Start Scheduler (Background Sync)
startScheduler();

// 5. Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});