var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');

function billedOrder() {
  return {
    id: 42,
    date: '2026-11-21',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: 'SAVE10',
    // These fields mirror the order lines produced by routes/orders.js.
    // In particular, the route stores HSN but does not store gstRate.
    items: [
      { id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 500, qty: 1 },
      { id: 2, name: 'Coffee', sku: 'COFFEE', hsn: '0901', price: 500, qty: 1 }
    ]
  };
}

test('CURRENT BEHAVIOUR: order pricing uses HSN slabs and discounts subtotal before GST', function () {
  var order = billedOrder();
  var totals = pricing.computeTotals(order.items, order.coupon);

  assert.deepEqual(totals, {
    subtotal: 1000,
    discount: 100,
    taxable: 900,
    tax: 103.5,
    cgst: 51.75,
    sgst: 51.75,
    total: 1003.5,
    lines: [
      { id: 1, name: 'Rice', hsn: '1006', gstPercent: 5, gross: 500, discount: 50, taxable: 450, tax: 22.5, net: 472.5 },
      { id: 2, name: 'Coffee', hsn: '0901', gstPercent: 18, gross: 500, discount: 50, taxable: 450, tax: 81, net: 531 }
    ]
  });
});

test('invoice uses the same HSN slabs and pre-GST coupon discount as order pricing', function () {
  var figures = invoice.computeInvoiceFigures(billedOrder());

  assert.deepEqual(figures, {
    subtotal: 1000,
    discount: 100,
    tax: 103.5,
    cgst: 51.75,
    sgst: 51.75,
    total: 1003.5,
    rows: [
      { name: 'Rice', sku: 'RICE', hsn: '1006', qty: 1, price: 500, gstPercent: 5, line: 500, lineTax: 22.5 },
      { name: 'Coffee', sku: 'COFFEE', hsn: '0901', qty: 1, price: 500, gstPercent: 18, line: 500, lineTax: 81 }
    ]
  });
});

test('rendered invoice total matches the order ledger without a reconciliation warning', function () {
  var order = billedOrder();
  order.total = pricing.computeTotals(order.items, order.coupon).total;

  var html = invoice.render(order);

  assert.match(html, /Invoice Total<\/td><td class="r">₹1003\.50/);
  assert.doesNotMatch(html, /Invoice computed total/);
  assert.match(html, /<td class="r">5%<\/td><td class="r">₹22\.50<\/td>/);
  assert.match(html, /<td class="r">18%<\/td><td class="r">₹81\.00<\/td>/);
});
