import { db } from "./db";

interface OrderUpdate {
  orderId: string;
  userId: string;
}

export async function finalizeOrder({ orderId, userId }: OrderUpdate) {
  const order = await db.orders.find(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const store = await db.stores.find(order.storeId);
  const taxRate: number = store.get("taxRate", 0);

  await db.orders.update(orderId, {
    total: order.subtotal * (1 + taxRate),
    finalizedBy: userId,
    finalizedAt: new Date().toISOString(),
  });

  return { ok: true };
}
