const mongoose = require('mongoose');

// Connection options
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    poolSize: 10,                    // Maximum 10 connections in pool
    serverSelectionTimeoutMS: 5000,  // Time to find a server: 5 seconds
    socketTimeoutMS: 45000,          // Time before operations timeout: 45 seconds
    keepAlive: true,                 // Keep connection alive
    keepAliveInitialDelay: 300000    // First keepalive after 5 minutes
};

// Connect to MongoDB
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, options);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Connection event handlers
        mongoose.connection.on('error', err => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
