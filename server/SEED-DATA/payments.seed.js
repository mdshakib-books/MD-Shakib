import Payment from "../src/models/payment.model.js";

export const seedPayments = async (orders) => {
    console.log("Seeding Payments...");

    const payments = [];

    // Find the paid digital order (Order 1 - John Doe)
    const paidOrder = orders.find(
        (o) => o.paymentMethod === "Online" && o.paymentStatus === "Paid",
    );

    if (paidOrder) {
        payments.push({
            orderId: paidOrder._id,
            userId: paidOrder.userId,
            paymentId: `pay_mock_${Math.random().toString(36).substring(7)}`,
            amount: paidOrder.totalAmount,
            currency: "INR",
            status: "Success",
            provider: "Razorpay",
        });
    }

    // Find Pending digital order
    const pendingOrder = orders.find(
        (o) => o.paymentMethod === "Online" && o.paymentStatus === "Pending",
    );

    if (pendingOrder) {
        payments.push({
            orderId: pendingOrder._id,
            userId: pendingOrder.userId,
            paymentId: `order_mock_${Math.random().toString(36).substring(7)}`,
            amount: pendingOrder.totalAmount,
            currency: "INR",
            status: "Created",
            provider: "Razorpay",
        });
    }

    const insertedPayments = await Payment.insertMany(payments);
    console.log(`✅ Seeded ${insertedPayments.length} Payment Records.`);
    return insertedPayments;
};
