#!/bin/bash

# Production start script with memory optimization

# Set Node.js memory options
export NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size --gc-interval=100"

# Start the server
node server.js