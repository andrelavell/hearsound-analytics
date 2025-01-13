#!/bin/bash

echo "Killing existing Node.js processes..."
pkill -f node

# Wait a moment to ensure processes are killed
sleep 2

# Start the backend server from the project root
echo "Starting backend server..."
cd /Users/deandremoore/CascadeProjects/shopify-fulfillment-tracker
node server/index.js > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend server started with PID: $BACKEND_PID"

# Wait a moment to let the backend server start
sleep 2

# Start the frontend server from the client directory
echo "Starting frontend server..."
cd /Users/deandremoore/CascadeProjects/shopify-fulfillment-tracker/client
PORT=3003 npm start > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend server started with PID: $FRONTEND_PID"

# Wait a moment to let both servers start
sleep 2

# Check if processes are running
if ps -p $BACKEND_PID > /dev/null; then
    echo "Backend server is running (PID: $BACKEND_PID)"
else
    echo "Error: Backend server failed to start"
    cat backend.log
fi

if ps -p $FRONTEND_PID > /dev/null; then
    echo "Frontend server is running (PID: $FRONTEND_PID)"
else
    echo "Error: Frontend server failed to start"
    cat frontend.log
fi

echo "Both servers have been restarted!"
echo "Frontend should be available at http://localhost:3003"
echo "Backend should be available at http://localhost:3002"

# Show running ports
echo "Checking running ports..."
lsof -i :3002,3003
