const User = require('../models/User');

const seedAdmin = async () => {
    try {
        const email = 'admin@dbc.in';
        const exists = await User.findOne({ username: email });

        if (!exists) {
            console.log('🌱 Seeding Admin User...');
            await User.create({
                username: email,
                password: '123456' // Will be hashed by pre-save hook
            });
            console.log(`✅ Admin created: ${email} / 123456`);
        }
    } catch (error) {
        console.error('❌ Seeding Error:', error);
    }
};

module.exports = seedAdmin;