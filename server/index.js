require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Shopify = require('shopify-api-node');
const path = require('path');

// Add simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Clear old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, CACHE_TTL);

const app = express();
const port = process.env.PORT || 3002;

// Log startup information
console.log('Starting server with config:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: port,
  SHOP_NAME: process.env.SHOP_NAME,
  currentDir: __dirname
});

const allowedOrigins = [
  'https://hearsound-analytics.onrender.com',
  'http://localhost:3000',
  'https://hearsound-analytics-api.onrender.com'
];

// Debug incoming requests
app.use((req, res, next) => {
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    host: req.headers.host
  });
  next();
});

app.use(cors({
  origin: true, // Allow all origins during testing
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Handle OPTIONS preflight requests
app.options('*', cors());

// Root route for basic health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    port: port
  });
});

// Test route
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ message: 'API is working' });
});

// Validate environment variables
console.log('Environment check:', {
  SHOP_NAME: process.env.SHOP_NAME,
  ACCESS_TOKEN: process.env.ACCESS_TOKEN ? '✓ Present' : '✗ Missing'
});

if (!process.env.SHOP_NAME || !process.env.ACCESS_TOKEN) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize Shopify client
let shopify;
try {
  shopify = new Shopify({
    shopName: process.env.SHOP_NAME,
    accessToken: process.env.ACCESS_TOKEN,
    apiVersion: '2024-01',
    autoLimit: true
  });
  console.log('Shopify client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Shopify client:', error);
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch all orders using cursor-based pagination
async function fetchAllOrders(params) {
  // Check cache first
  const cacheKey = JSON.stringify(params);
  const cachedResult = cache.get(cacheKey);
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    console.log('Returning cached orders');
    return cachedResult.data;
  }

  const allOrders = [];
  let hasNextPage = true;
  let currentPage = 1;

  while (hasNextPage) {
    console.log(`Fetching page ${currentPage}. Current total: ${allOrders.length} orders`);
    const orders = await shopify.order.list(params);
    
    allOrders.push(...orders);
    
    if (orders.nextPageParameters) {
      params = orders.nextPageParameters;
      currentPage++;
      await sleep(100); // Reduced delay to 100ms
    } else {
      hasNextPage = false;
    }
  }

  console.log(`Finished fetching all orders. Total: ${allOrders.length}`);
  
  // Store in cache
  cache.set(cacheKey, {
    data: allOrders,
    timestamp: Date.now()
  });
  
  return allOrders;
}

app.get('/api/orders', async (req, res) => {
  console.log('----- /api/orders endpoint hit ------');
  console.log('Query params:', req.query);
  
  try {
    const { startDate, endDate } = req.query;
    
    // Parse the ISO dates directly - they already include timezone info
    const startDateISO = new Date(startDate).toISOString();
    const endDateISO = new Date(endDate).toISOString();
    
    console.log('Querying orders with timestamps:', {
      start: startDateISO,
      end: endDateISO,
      current: new Date().toISOString()
    });

    // Initial query parameters
    let params = {
      status: 'any',
      created_at_min: startDateISO,
      created_at_max: endDateISO,
      limit: 250,
      fields: 'id,order_number,created_at,fulfillments,refunds,financial_status,shipping_address,fulfillment_status,total_price,line_items.product_id,line_items.title,line_items.sku,line_items.quantity,line_items.price'
    };

    const orders = await fetchAllOrders(params);
    console.log(`Retrieved ${orders.length} orders`);

    // Debug a sample order
    if (orders.length > 0) {
      console.log('Sample order data:', JSON.stringify(orders[0], null, 2));
    }

    // Debug refund statuses
    const refundStatuses = orders.map(order => ({
      id: order.id,
      financial_status: order.financial_status,
      refunds: order.refunds ? order.refunds.length : 0
    }));
    console.log('Order statuses:', refundStatuses);

    const ordersWithFulfillment = orders.map(order => {
      // Get the first fulfillment
      const fulfillment = order.fulfillments && order.fulfillments[0];
      
      // Calculate refund amount
      let refundAmount = 0;
      if (order.refunds && order.refunds.length > 0) {
        refundAmount = order.refunds.reduce((total, refund) => {
          if (refund.transactions && refund.transactions.length > 0) {
            return total + refund.transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
          }
          return total;
        }, 0);
      }

      // Get product details from line items
      const products = order.line_items ? order.line_items.map(item => ({
        id: item.product_id,
        title: item.title,
        sku: item.sku || 'N/A',
        quantity: item.quantity,
        price: parseFloat(item.price)
      })) : [];

      // Debug log for this specific order
      console.log('Processing order:', {
        id: order.id,
        financial_status: order.financial_status,
        refunds: order.refunds ? order.refunds.length : 0,
        created_at: order.created_at,
        total_price: parseFloat(order.total_price || 0),
        refund_amount: refundAmount,
        has_line_items: order.line_items ? order.line_items.length : 0,
        products: products.length
      });

      // Get delivery date - try different methods
      let deliveryDate = null;
      if (fulfillment) {
        if (fulfillment.shipment_status === 'delivered') {
          deliveryDate = fulfillment.updated_at;
        } else if (fulfillment.status === 'success') {
          deliveryDate = fulfillment.created_at;
        }
      }

      // Get refund date from refunds
      let refundDate = null;
      if (order.refunds && order.refunds.length > 0) {
        refundDate = order.refunds[0].created_at;
      }

      // Calculate days to refund if we have both dates
      let daysToRefund = null;
      if (deliveryDate && refundDate) {
        const deliveryTime = new Date(deliveryDate);
        const refundTime = new Date(refundDate);
        const days = Math.round((refundTime - deliveryTime) / (1000 * 60 * 60 * 24));
        // Only set daysToRefund if it's positive (refunded after delivery)
        daysToRefund = days > 0 ? days : 'before_delivery';
      }

      return {
        id: order.id,
        orderNumber: order.order_number,
        orderDate: order.created_at,
        shippingName: order.shipping_address ? order.shipping_address.name : 'N/A',
        fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
        fulfillmentDate: fulfillment ? fulfillment.created_at : null,
        trackingNumber: fulfillment ? fulfillment.tracking_number : null,
        trackingUrl: fulfillment ? fulfillment.tracking_url : null,
        financial_status: order.financial_status,
        refundStatus: order.financial_status === 'refunded' ? 'Refunded' : 
                     order.financial_status === 'partially_refunded' ? 'Partially Refunded' : 
                     'Not Refunded',
        deliveryDate: deliveryDate,
        transitStatus: fulfillment ? fulfillment.shipment_status || fulfillment.status || 'unknown' : null,
        refundDate: refundDate,
        daysToRefund: daysToRefund,
        hasRefunds: order.refunds && order.refunds.length > 0,
        totalPrice: parseFloat(order.total_price || 0),
        refundAmount: refundAmount,
        products: products
      };
    });

    console.log(`Successfully processed ${ordersWithFulfillment.length} orders`);
    res.json(ordersWithFulfillment);

  } catch (error) {
    console.error('Error processing orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: err.message,
    path: req.path,
    method: req.method
  });
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Current directory:', __dirname);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Export app for testing
module.exports = { app, server };
