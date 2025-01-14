import React, { useState, useEffect, useMemo } from 'react';
import { format as dateFnsFormat, differenceInDays as dateFnsDifferenceInDays, subDays, startOfDay, endOfDay } from 'date-fns/esm';
import axios from 'axios';
import './globals.css';

const API_URL = 'https://hearsound-analytics-api.onrender.com';

function App() {
  const [orders, setOrders] = useState([]);
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [dateRangeText, setDateRangeText] = useState('Last 30 days');
  const [isLoading, setIsLoading] = useState(false);
  const [analytics, setAnalytics] = useState({
    totalOrders: 0,
    totalRefunds: 0,
    avgDaysToRefund: 0,
    totalRefundAmount: 0,
    refundRate: 0,
    avgRefundAmount: 0
  });

  // Get unique products from orders
  const products = useMemo(() => {
    const productMap = new Map();
    orders.forEach(order => {
      order.products?.forEach(product => {
        productMap.set(product.sku, {
          sku: product.sku,
          title: product.title
        });
      });
    });
    return Array.from(productMap.values());
  }, [orders]);

  const predefinedRanges = [
    { label: 'Today', getValue: () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return [today, new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)];
    }},
    { label: 'Yesterday', getValue: () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return [yesterday, new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)];
    }},
    { label: 'Last 7 days', getValue: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      console.log('Last 7 days range:', { start, end });
      return [start, end];
    }},
    { label: 'Last 30 days', getValue: () => [subDays(new Date(), 29), new Date()] },
    { label: 'Last 90 days', getValue: () => [subDays(new Date(), 89), new Date()] },
    { label: 'Last 365 days', getValue: () => [subDays(new Date(), 364), new Date()] },
  ];

  useEffect(() => {
    fetchOrders();
  }, [startDate, endDate]);

  useEffect(() => {
    calculateAnalytics();
  }, [orders, startDate, endDate]);

  const calculateAnalytics = () => {
    // Filter orders by date range
    const filteredOrders = orders.filter(order => {
      // Only include full refunds, not partial refunds
      if (order.financial_status !== 'refunded') return false;
      
      // Only look at orders that have a refund
      if (!order.refundDate || order.refundAmount <= 0) return false;
      
      // Convert refund date to Date object
      const refundDate = new Date(order.refundDate);
      
      // Check if refund date falls within selected range
      return refundDate >= startOfDay(startDate) && refundDate <= endOfDay(endDate);
    });

    // Calculate total orders in date range (regardless of refund status)
    const totalOrdersInRange = orders.filter(order => {
      const orderDate = new Date(order.orderDate);
      return orderDate >= startOfDay(startDate) && orderDate <= endOfDay(endDate);
    }).length;

    // Calculate analytics
    const totalRefunds = filteredOrders.length;
    const totalRefundAmount = filteredOrders.reduce((sum, order) => sum + order.refundAmount, 0);
    const avgDaysToRefund = totalRefunds > 0
      ? filteredOrders.reduce((sum, order) => {
          const days = order.daysToRefund;
          return sum + (typeof days === 'number' ? days : 0);
        }, 0) / totalRefunds
      : 0;

    setAnalytics({
      totalOrders: totalOrdersInRange,
      totalRefunds,
      avgDaysToRefund: Number(avgDaysToRefund.toFixed(1)),
      totalRefundAmount,
      refundRate: totalOrdersInRange > 0 ? (totalRefunds / totalOrdersInRange) * 100 : 0,
      avgRefundAmount: totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (number) => {
    return new Intl.NumberFormat('en-US').format(number);
  };

  const exportToCSV = () => {
    // Only export orders that have refunds and are within the selected date range
    const refundedOrders = orders.filter(order => {
      if (!order.refundDate) return false;
      const refundDate = new Date(order.refundDate);
      return refundDate >= startOfDay(startDate) && refundDate <= endOfDay(endDate);
    });

    // Define CSV headers
    const headers = [
      'Order Number',
      'Order Date',
      'Refund Date',
      'Days to Refund',
      'Order Amount',
      'Refund Amount'
    ];

    // Convert orders to CSV rows
    const rows = refundedOrders.map(order => [
      order.orderNumber,
      new Date(order.orderDate).toLocaleDateString(),
      new Date(order.refundDate).toLocaleDateString(),
      order.daysToRefund,
      order.orderAmount.toFixed(2),
      order.refundAmount.toFixed(2)
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `refunds-${dateRangeText.toLowerCase().replace(/\s+/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      // For orders, we'll fetch a wider date range to catch old orders that might have been refunded recently
      const start = startOfDay(startDate);
      const end = new Date(endDate);
      start.setFullYear(start.getFullYear() - 1); // Get orders from up to 1 year before the start date
      start.setHours(0, 0, 0, 0);
      
      end.setHours(23, 59, 59, 999);
      
      const formattedStartDate = dateFnsFormat(start, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
      const formattedEndDate = dateFnsFormat(end, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
      
      console.log('Fetching orders:', { formattedStartDate, formattedEndDate });
      
      const response = await axios.get(`${API_URL}/api/orders`, {
        params: {
          startDate: formattedStartDate,
          endDate: formattedEndDate
        }
      });
      
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray">
      <nav className="bg-white border-b border-gray shadow-sm">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src="https://cdn.shopify.com/s/files/1/0688/0179/0181/files/hearsound-2.png?v=1727719149" 
              alt="HearSound Logo" 
              className="h-8 w-auto"
            />
            <div className="h-6 w-px bg-gray mx-4" />
            <h1 className="text-xl font-semibold text-navy">Refund Analytics</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-navy">Refund Analytics</h1>
          <div className="flex space-x-2">
            {predefinedRanges.map(range => (
              <button
                key={range.label}
                onClick={() => {
                  const [newStart, newEnd] = range.getValue();
                  setStartDate(newStart);
                  setEndDate(newEnd);
                  setDateRangeText(range.label);
                }}
                className={`date-button ${
                  dateRangeText === range.label ? 'date-button-active' : 'date-button-inactive'
                }`}
                disabled={isLoading}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy"></div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {/* Order Statistics */}
            <div className="stat-card">
              <h3 className="stat-title">Total Orders</h3>
              <p className="stat-value">{analytics.totalOrders}</p>
            </div>

            <div className="stat-card">
              <h3 className="stat-title">Total Refunds</h3>
              <p className="stat-value">{analytics.totalRefunds}</p>
            </div>

            <div className="stat-card">
              <h3 className="stat-title">Average Days to Refund</h3>
              <p className="stat-value">{analytics.avgDaysToRefund.toFixed(1)} days</p>
            </div>

            {/* Financial Statistics */}
            <div className="stat-card">
              <h3 className="stat-title">Total Refund Amount</h3>
              <p className="stat-value">${analytics.totalRefundAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>

            <div className="stat-card">
              <h3 className="stat-title">Average Refund Amount</h3>
              <p className="stat-value">${analytics.avgRefundAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>

            <div className="stat-card">
              <h3 className="stat-title">Refund Rate</h3>
              <p className="stat-value">{analytics.refundRate.toFixed(1)}%</p>
            </div>
          </div>
        )}
        <div className="table-container">
          <div className="px-6 py-4 border-b border-gray flex justify-between items-center">
            <h2 className="text-lg font-semibold text-navy">Refunds</h2>
            <button
              onClick={exportToCSV}
              disabled={isLoading}
              className="px-4 py-2 bg-navy text-white rounded hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export to CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-order">Order #</th>
                  <th className="table-header w-date">Order Date</th>
                  <th className="table-header w-name">Name</th>
                  <th className="table-header w-tracking">Tracking Number</th>
                  <th className="table-header w-delivery">Delivery Date</th>
                  <th className="table-header w-refund">Refund Date</th>
                  <th className="table-header w-days">Days to Refund</th>
                  <th className="table-header w-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter(order => {
                    // Only include full refunds
                    if (order.financial_status !== 'refunded') return false;
                    
                    // Check if refund date is within selected range
                    if (!order.refundDate) return false;
                    const refundDate = new Date(order.refundDate);
                    return refundDate >= startOfDay(startDate) && refundDate <= endOfDay(endDate);
                  })
                  .map((order) => (
                    <tr key={order.id} className="table-row">
                      <td className="table-cell w-order font-medium">{order.orderNumber}</td>
                      <td className="table-cell w-date">
                        {order.orderDate ? dateFnsFormat(new Date(order.orderDate), 'MMM dd, yyyy') : '-'}
                      </td>
                      <td className="table-cell w-name">{order.shippingName}</td>
                      <td className="table-cell w-tracking">
                        {order.trackingUrl ? (
                          <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="tracking-link">
                            {order.trackingNumber}
                          </a>
                        ) : (
                          order.trackingNumber || '-'
                        )}
                      </td>
                      <td className="table-cell w-delivery">
                        {order.deliveryDate
                          ? dateFnsFormat(new Date(order.deliveryDate), 'MMM dd, yyyy')
                          : order.transitStatus === 'delivered' ? 'Delivered' : 'Not delivered'}
                      </td>
                      <td className="table-cell w-refund">
                        {order.refundDate
                          ? dateFnsFormat(new Date(order.refundDate), 'MMM dd, yyyy')
                          : '-'}
                      </td>
                      <td className="table-cell w-days">
                        {typeof order.daysToRefund === 'number' ? 
                          `${order.daysToRefund} days` : 
                          order.daysToRefund === 'before_delivery' ? 
                          'Refunded before delivery' :
                          'Delivery date unknown'}
                      </td>
                      <td className="table-cell w-actions">
                        <a 
                          href={`https://dc162a-d0.myshopify.com/admin/orders/${order.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 bg-gray border border-gray-dark text-navy text-sm font-medium rounded-md hover:bg-gray-dark hover:text-white transition-colors duration-200"
                        >
                          View Order
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
