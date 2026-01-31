const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// ✅ FIXED: Removed 'next' parameter. 
// With async/await, Mongoose waits for the promise to resolve automatically.
UserSchema.pre('save', async function () {
    // 1. If password is not modified, do nothing
    if (!this.isModified('password')) return;

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);