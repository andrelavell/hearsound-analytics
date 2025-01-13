import React, { useState, useEffect } from 'react';
import { format as dateFnsFormat, differenceInDays as dateFnsDifferenceInDays, subDays, startOfDay, endOfDay } from 'date-fns/esm';
import axios from 'axios';
import './globals.css';

function App() {
  const [orders, setOrders] = useState([]);
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [dateRangeText, setDateRangeText] = useState('Last 30 days');
  const [analytics, setAnalytics] = useState({
    totalOrders: 0,
    totalRefunds: 0,
    avgDaysToRefund: 0
  });

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
    { label: 'Last 7 days', getValue: () => [subDays(new Date(), 7), new Date()] },
    { label: 'Last 30 days', getValue: () => [subDays(new Date(), 30), new Date()] },
    { label: 'Last 90 days', getValue: () => [subDays(new Date(), 90), new Date()] },
    { label: 'Last 365 days', getValue: () => [subDays(new Date(), 365), new Date()] },
  ];

  useEffect(() => {
    fetchOrders();
  }, [startDate, endDate]);

  useEffect(() => {
    calculateAnalytics();
  }, [orders, startDate, endDate]);

  const calculateAnalytics = () => {
    // Filter orders that have refunds
    const refundedOrders = orders.filter(order => 
      order.refundStatus === 'Refunded' && order.refundDate
    );

    // Then filter by refund date instead of order date
    const refundsInRange = refundedOrders.filter(order => {
      const refundDate = new Date(order.refundDate);
      return refundDate >= startOfDay(startDate) && refundDate <= endOfDay(endDate);
    });

    console.log('Refunds analysis:', {
      totalRefundedOrders: refundedOrders.length,
      refundsInDateRange: refundsInRange.length,
      dateRange: {
        start: startOfDay(startDate),
        end: endOfDay(endDate)
      },
      sampleRefunds: refundsInRange.slice(0, 3).map(o => ({
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        refundDate: o.refundDate
      }))
    });

    const validDaysToRefund = refundsInRange
      .filter(order => typeof order.daysToRefund === 'number') // Only include numeric days
      .map(order => order.daysToRefund);

    // Calculate average days to refund
    const avgDays = validDaysToRefund.length > 0
      ? validDaysToRefund.reduce((acc, curr) => acc + curr, 0) / validDaysToRefund.length
      : 0;

    setAnalytics({
      totalOrders: orders.length,
      totalRefunds: refundsInRange.length,
      avgDaysToRefund: Math.round(avgDays * 10) / 10
    });
  };

  const fetchOrders = async () => {
    try {
      // For orders, we'll fetch a wider date range to catch old orders that might have been refunded recently
      const start = new Date(startDate);
      start.setFullYear(start.getFullYear() - 1); // Get orders from up to 1 year before the start date
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const formattedStartDate = dateFnsFormat(start, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
      const formattedEndDate = dateFnsFormat(end, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
      
      console.log('Fetching orders:', { formattedStartDate, formattedEndDate });
      
      const response = await axios.get('http://localhost:3002/api/orders', {
        params: {
          startDate: formattedStartDate,
          endDate: formattedEndDate
        }
      });
      
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
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
        <div className="flex justify-end mb-8 space-x-2">
          {predefinedRanges.map((range) => (
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
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="stat-card">
            <div className="stat-label">Total Orders</div>
            <div className="stat-value">{analytics.totalOrders}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Refunds</div>
            <div className="stat-value text-coral">{analytics.totalRefunds}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Average Days to Refund</div>
            <div className="stat-value">{analytics.avgDaysToRefund} days</div>
          </div>
        </div>

        <div className="table-container">
          <div className="px-6 py-4 border-b border-gray">
            <h2 className="text-lg font-semibold text-navy">Refunds</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    'Order #',
                    'Order Date',
                    'Name',
                    'Tracking Number',
                    'Delivery Date',
                    'Refund Date',
                    'Days to Refund',
                    'Actions'
                  ].map(header => (
                    <th key={header} className="table-header">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter(order => order.refundStatus === 'Refunded' && order.refundDate)
                  .filter(order => {
                    const refundDate = new Date(order.refundDate);
                    return refundDate >= startOfDay(startDate) && refundDate <= endOfDay(endDate);
                  })
                  .map((order) => (
                    <tr key={order.id} className="table-row">
                      <td className="table-cell font-medium">{order.orderNumber}</td>
                      <td className="table-cell">
                        {order.orderDate ? dateFnsFormat(new Date(order.orderDate), 'MMM dd, yyyy') : '-'}
                      </td>
                      <td className="table-cell">{order.shippingName}</td>
                      <td className="table-cell">
                        {order.trackingUrl ? (
                          <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="tracking-link">
                            {order.trackingNumber}
                          </a>
                        ) : (
                          order.trackingNumber || '-'
                        )}
                      </td>
                      <td className="table-cell">
                        {order.deliveryDate
                          ? dateFnsFormat(new Date(order.deliveryDate), 'MMM dd, yyyy')
                          : order.transitStatus === 'delivered' ? 'Delivered' : 'Not delivered'}
                      </td>
                      <td className="table-cell">
                        {order.refundDate
                          ? dateFnsFormat(new Date(order.refundDate), 'MMM dd, yyyy')
                          : '-'}
                      </td>
                      <td className="table-cell">
                        {typeof order.daysToRefund === 'number' ? 
                          `${order.daysToRefund} days` : 
                          order.daysToRefund === 'before_delivery' ? 
                          'Refunded before delivery' :
                          'Delivery date unknown'}
                      </td>
                      <td className="table-cell">
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
