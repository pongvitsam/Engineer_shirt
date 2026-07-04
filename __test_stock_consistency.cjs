#!/usr/bin/env node
/**
 * Offline stress tests for stock remaining consistency.
 * Mirrors Code.js + JavaScript.html stock logic (calcSoldFromOrders_,
 * getStockSummaryWithSold_, validateStockForOrderItems_, edit-modal helpers).
 */

const STOCK_SIZES = ["XS", "S", "M", "L", "XL", "2L", "3L", "5L", "7L"];
const PAYMENT_FREE_GIVEAWAY = "เสื้อแจกฟรี";

const DEFAULT_DELIVERED = {
  XS: 0, S: 0, M: 38, L: 60, XL: 56, "2L": 32, "3L": 8, "5L": 3, "7L": 3
};

function orderSizeKey_(size) {
  return String(size || "").trim();
}

function calcSoldFromOrders_(orders) {
  const sold = {};
  STOCK_SIZES.forEach(s => { sold[s] = 0; });
  (orders || []).forEach(o => {
    const size = orderSizeKey_(o.size);
    const qty = Number(o.qty) || 0;
    if (size in sold) sold[size] += qty;
  });
  return sold;
}

function getStockSummaryWithSold_(deliveredMap, soldMap) {
  return STOCK_SIZES.map(size => {
    const delivered = deliveredMap[size] !== undefined
      ? deliveredMap[size]
      : (DEFAULT_DELIVERED[size] || 0);
    const sold = soldMap[size] || 0;
    return {
      size,
      delivered,
      sold,
      remaining: Math.max(delivered - sold, 0)
    };
  });
}

function validateStockForOrderItems_(orders, items, excludeOrderId, deliveredMap) {
  const filtered = (orders || []).filter(o => String(o.orderId) !== String(excludeOrderId || ""));
  const soldMap = calcSoldFromOrders_(filtered);
  const stock = getStockSummaryWithSold_(deliveredMap, soldMap);
  const agg = {};
  (Array.isArray(items) ? items : []).forEach(it => {
    const size = orderSizeKey_(it.size);
    const qty = Number(it.qty) || 0;
    if (!STOCK_SIZES.includes(size)) throw new Error("bad size: " + size);
    if (qty <= 0) return;
    agg[size] = (agg[size] || 0) + qty;
  });
  let totalQty = 0;
  Object.keys(agg).forEach(size => {
    totalQty += agg[size];
    const s = stock.find(x => x.size === size);
    if (!s) throw new Error("missing size " + size);
    if (s.remaining < agg[size]) {
      throw new Error("size " + size + " remaining " + s.remaining + " < " + agg[size]);
    }
  });
  if (totalQty <= 0) throw new Error("กรุณาเพิ่มไซส์อย่างน้อย 1 รายการ");
  return agg;
}

function validateApprovedChangeAgainstStock_(deliveredMap, allOrders, currentMap, requestMap) {
  const stock = getStockSummaryWithSold_(deliveredMap, calcSoldFromOrders_(allOrders));
  const stockMap = {};
  stock.forEach(s => { stockMap[s.size] = s; });
  STOCK_SIZES.forEach(size => {
    const currentQty = Number(currentMap[size] || 0);
    const requestedQty = Number(requestMap[size] || 0);
    const delta = requestedQty - currentQty;
    if (delta <= 0) return;
    const s = stockMap[size];
    if (!s) throw new Error("missing size " + size);
    if (s.remaining < delta) {
      throw new Error("approve blocked: " + size + " remaining " + s.remaining + " need " + delta);
    }
  });
}

function stockRemainingForSize(stock, size) {
  const s = (stock || []).find(x => x.size === orderSizeKey_(size));
  return Math.max(0, Number(s && s.remaining) || 0);
}

function qtyInOrderForSize(orders, orderId, size) {
  const want = orderSizeKey_(size);
  return (orders || []).filter(o => String(o.orderId) === String(orderId) && orderSizeKey_(o.size) === want)
    .reduce((sum, o) => sum + Number(o.qty || 0), 0);
}

function maxEditableQtyForOrder(stock, orders, orderId, size) {
  return stockRemainingForSize(stock, size) + qtyInOrderForSize(orders, orderId, size);
}

function recalcStockFromOrdersClient(stock, stockSizes, orders, canRecalc) {
  if (!stock || !orders) return stock;
  if (!canRecalc) return stock;
  const sold = {};
  stockSizes.forEach(s => { sold[s] = 0; });
  orders.forEach(o => {
    const size = orderSizeKey_(o.size);
    if (size in sold) sold[size] += Number(o.qty || 0);
  });
  return stock.map(s => ({
    ...s,
    sold: sold[s.size] || 0,
    remaining: Math.max(s.delivered - (sold[s.size] || 0), 0)
  }));
}

function cloneDelivered() {
  return Object.assign({}, DEFAULT_DELIVERED);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runTest(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message };
  }
}

function makeOrder(orderId, region, size, qty, status, paymentStatus) {
  return {
    orderId,
    region,
    size,
    qty,
    status: status || "สั่งออเดอร์แล้วรอตรวจสอบการชำระ",
    paymentStatus: paymentStatus || ""
  };
}

// ── Tests ────────────────────────────────────────────────────────────

const tests = [];

tests.push(runTest("remaining = delivered - sold (all orders)", () => {
  const delivered = cloneDelivered();
  const orders = [
    makeOrder("O1", "กฟน.1", "M", 10),
    makeOrder("O2", "กฟฉ.1", "M", 5),
    makeOrder("O3", "กฟน.2", "L", 20)
  ];
  const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  const m = stock.find(s => s.size === "M");
  assert(m.remaining === 38 - 15, "M remaining should be 23, got " + m.remaining);
  assert(m.sold === 15, "M sold should be 15");
}));

tests.push(runTest("edit modal display matches stock page remaining", () => {
  const delivered = cloneDelivered();
  const orders = [
    makeOrder("ORD-100", "กฟน.1", "M", 8),
    makeOrder("ORD-200", "กฟฉ.1", "M", 4)
  ];
  const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  const displayRemain = stockRemainingForSize(stock, "M");
  assert(displayRemain === 26, "stock page M remaining should be 26");
  const maxEdit = maxEditableQtyForOrder(stock, orders, "ORD-100", "M");
  assert(maxEdit === 34, "max editable for ORD-100 M should be 26+8=34");
  assert(displayRemain !== maxEdit, "display remaining must differ from max when order holds qty");
}));

tests.push(runTest("validateStockForOrderItems excludes current order", () => {
  const delivered = cloneDelivered();
  const orders = [
    makeOrder("ORD-A", "กฟน.1", "M", 30),
    makeOrder("ORD-B", "กฟฉ.1", "M", 5)
  ];
  validateStockForOrderItems_(orders, [{ size: "M", qty: 8 }], "ORD-A", delivered);
  let threw = false;
  try {
    validateStockForOrderItems_(orders, [{ size: "M", qty: 9 }], "ORD-B", delivered);
  } catch (e) {
    threw = true;
  }
  assert(threw, "should reject ORD-B increasing M beyond remaining");
}));

tests.push(runTest("validateStockForOrderItems rejects empty items", () => {
  const delivered = cloneDelivered();
  const orders = [makeOrder("ORD-Z", "กฟน.1", "M", 1)];
  let threw = false;
  try {
    validateStockForOrderItems_(orders, [], "ORD-Z", delivered);
  } catch (e) {
    threw = e.message.includes("กรุณาเพิ่มไซส์");
  }
  assert(threw, "empty items must throw totalQty<=0 error");
}));

tests.push(runTest("cart orders count toward sold / remaining", () => {
  const delivered = cloneDelivered();
  const orders = [
    makeOrder("ORD-CART", "กฟน.1", "L", 10, "อยู่ในตะกร้า"),
    makeOrder("ORD-SUB", "กฟฉ.1", "L", 5)
  ];
  const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  const l = stock.find(s => s.size === "L");
  assert(l.sold === 15, "cart + submitted both count as sold");
  assert(l.remaining === 45, "L remaining should be 60-15=45");
}));

tests.push(runTest("non-admin client recalc must not inflate remaining", () => {
  const delivered = cloneDelivered();
  const allOrders = [
    makeOrder("O1", "กฟน.1", "M", 20),
    makeOrder("O2", "กฟฉ.1", "M", 10)
  ];
  const serverStock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(allOrders));
  const regionalOrders = allOrders.filter(o => o.region === "กฟน.1");
  const badStock = recalcStockFromOrdersClient(
    serverStock.map(s => ({ ...s })),
    STOCK_SIZES,
    regionalOrders,
    false
  );
  const mServer = serverStock.find(s => s.size === "M").remaining;
  const mBad = badStock.find(s => s.size === "M").remaining;
  assert(mBad === mServer, "non-admin recalc should leave stock unchanged");
}));

tests.push(runTest("viewer client recalc must not inflate remaining when free-giveaway hidden", () => {
  const delivered = cloneDelivered();
  const allOrders = [
    makeOrder("O1", "กฟน.1", "M", 10),
    makeOrder("O2", "กฟฉ.1", "M", 8, "สั่งออเดอร์แล้วรอตรวจสอบการชำระ", PAYMENT_FREE_GIVEAWAY)
  ];
  const serverStock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(allOrders));
  const viewerOrders = allOrders.filter(o => o.paymentStatus !== PAYMENT_FREE_GIVEAWAY);
  const viewerStock = recalcStockFromOrdersClient(
    serverStock.map(s => ({ ...s })),
    STOCK_SIZES,
    viewerOrders,
    false
  );
  assert(
    viewerStock.find(s => s.size === "M").remaining === serverStock.find(s => s.size === "M").remaining,
    "viewer must keep server remaining when free-giveaway rows are hidden"
  );
}));

tests.push(runTest("admin client recalc matches server", () => {
  const delivered = cloneDelivered();
  const orders = [
    makeOrder("O1", "กฟน.1", "XL", 10),
    makeOrder("O2", "กฟฉ.1", "XL", 6)
  ];
  const serverStock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  const clientStock = recalcStockFromOrdersClient(
    serverStock.map(s => ({ ...s })),
    STOCK_SIZES,
    orders,
    true
  );
  STOCK_SIZES.forEach(size => {
    const a = serverStock.find(s => s.size === size);
    const b = clientStock.find(s => s.size === size);
    assert(a.remaining === b.remaining, size + " remaining mismatch admin recalc");
    assert(a.sold === b.sold, size + " sold mismatch admin recalc");
  });
}));

tests.push(runTest("size trim keeps sold and max editable consistent", () => {
  const delivered = cloneDelivered();
  const orders = [makeOrder("ORD-T", "กฟน.1", " M", 4)];
  const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  assert(stock.find(s => s.size === "M").sold === 4, "trimmed size should count toward M sold");
  assert(qtyInOrderForSize(orders, "ORD-T", "M") === 4, "qtyInOrderForSize must trim size");
  assert(maxEditableQtyForOrder(stock, orders, "ORD-T", "M") === stock.find(s => s.size === "M").remaining + 4);
}));

tests.push(runTest("validateApprovedChangeAgainstStock rejects over-remaining delta", () => {
  const delivered = cloneDelivered();
  const orders = [makeOrder("O1", "กฟน.1", "M", 35)];
  validateApprovedChangeAgainstStock_(delivered, orders, { M: 35 }, { M: 38 });
  let threw = false;
  try {
    validateApprovedChangeAgainstStock_(delivered, orders, { M: 35 }, { M: 39 });
  } catch (e) {
    threw = true;
  }
  assert(threw, "must reject approve delta beyond remaining");
}));

tests.push(runTest("stress: random orders stay consistent", () => {
  const delivered = cloneDelivered();
  let orders = [];
  let seed = 42;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  for (let i = 0; i < 500; i++) {
    const size = STOCK_SIZES[Math.floor(rnd() * STOCK_SIZES.length)];
    const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
    const remain = stockRemainingForSize(stock, size);
    if (remain <= 0) continue;
    const qty = Math.max(1, Math.min(remain, Math.floor(rnd() * 5) + 1));
    const oid = "ORD-" + i;
    orders.push(makeOrder(oid, "กฟน.1", size, qty));
    const stockAfter = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
    const s = stockAfter.find(x => x.size === size);
    assert(s.remaining === remain - qty, "stress remaining drift at i=" + i);
    assert(
      maxEditableQtyForOrder(stockAfter, orders, oid, size) === s.remaining + qty,
      "stress max editable mismatch at i=" + i
    );
  }
}));

tests.push(runTest("stress: edit-in-place never exceeds max editable", () => {
  const delivered = cloneDelivered();
  const orders = [makeOrder("ORD-X", "กฟน.1", "M", 5), makeOrder("ORD-Y", "กฟฉ.1", "M", 10)];
  const stock = getStockSummaryWithSold_(delivered, calcSoldFromOrders_(orders));
  const maxEdit = maxEditableQtyForOrder(stock, orders, "ORD-X", "M");
  for (let q = 1; q <= maxEdit; q++) {
    validateStockForOrderItems_(orders, [{ size: "M", qty: q }], "ORD-X", delivered);
  }
  let rejected = false;
  try {
    validateStockForOrderItems_(orders, [{ size: "M", qty: maxEdit + 1 }], "ORD-X", delivered);
  } catch (e) {
    rejected = true;
  }
  assert(rejected, "qty maxEdit+1 should be rejected");
}));

// ── Report ───────────────────────────────────────────────────────────

const passed = tests.filter(t => t.ok);
const failed = tests.filter(t => !t.ok);

console.log("\n=== Stock consistency stress tests ===\n");
tests.forEach(t => {
  console.log((t.ok ? "PASS" : "FAIL") + "  " + t.name + (t.error ? " — " + t.error : ""));
});
console.log("\n" + passed.length + "/" + tests.length + " passed");
if (failed.length) process.exit(1);
