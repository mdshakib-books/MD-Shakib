import Order from "../src/models/order.model.js";
import { ORDER_STATUS } from "../src/utils/order.constants.js";
import { PAYMENT_METHODS } from "../src/utils/order.constants.js";

export const seedOrders = async (users, books, addresses) => {
    console.log("Seeding Orders...");

    const orders = [];

    // Order 1: John Doe - Delivered & Paid (Online)
    const johnAddr = addresses.find(
        (a) => a.userId.toString() === users[0]._id.toString() && a.isDefault,
    );
    orders.push({
        userId: users[0]._id,
        items: [
            {
                bookId: books[2]._id, // 1984
                title: books[2].title,
                price: books[2].price,
                imageUrl: books[2].imageUrl,
                quantity: 1,
            },
        ],
        totalAmount: books[2].price,
        address: {
            fullName: johnAddr.fullName,
            phone: johnAddr.phone,
            pincode: johnAddr.pincode,
            state: johnAddr.state,
            city: johnAddr.city,
            houseNo: johnAddr.houseNo,
            area: johnAddr.area,
        },
        paymentMethod: PAYMENT_METHODS.ONLINE,
        paymentStatus: "Paid",
        orderStatus: ORDER_STATUS.DELIVERED,
        idempotencyKey: "seed_order_john_1",
    });

    // Order 2: Jane Smith - Processing & Pending (COD)
    const janeAddr = addresses.find(
        (a) => a.userId.toString() === users[1]._id.toString() && a.isDefault,
    );
    orders.push({
        userId: users[1]._id,
        items: [
            {
                bookId: books[3]._id, // Dune
                title: books[3].title,
                price: books[3].price,
                imageUrl: books[3].imageUrl,
                quantity: 2,
            },
        ],
        totalAmount: books[3].price * 2,
        address: {
            fullName: janeAddr.fullName,
            phone: janeAddr.phone,
            pincode: janeAddr.pincode,
            state: janeAddr.state,
            city: janeAddr.city,
            houseNo: janeAddr.houseNo,
            area: janeAddr.area,
        },
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: "Pending",
        orderStatus: ORDER_STATUS.PROCESSING,
        idempotencyKey: "seed_order_jane_1",
    });

    // Order 3: John Doe - Pending Online Payment waiting for webhook
    orders.push({
        userId: users[0]._id,
        items: [
            {
                bookId: books[4]._id, // Sapiens
                title: books[4].title,
                price: books[4].price,
                imageUrl: books[4].imageUrl,
                quantity: 1,
            },
        ],
        totalAmount: books[4].price,
        address: {
            fullName: johnAddr.fullName,
            phone: johnAddr.phone,
            pincode: johnAddr.pincode,
            state: johnAddr.state,
            city: johnAddr.city,
            houseNo: johnAddr.houseNo,
            area: johnAddr.area,
        },
        paymentMethod: PAYMENT_METHODS.ONLINE,
        paymentStatus: "Pending",
        orderStatus: ORDER_STATUS.PENDING, // Hasn't paid yet
        idempotencyKey: "seed_order_john_2",
    });

    const insertedOrders = await Order.insertMany(orders);
    console.log(`✅ Seeded ${insertedOrders.length} Orders.`);

    // Adjust stock manually for these seed orders to reflect real behavior
    // 1984: -1
    books[2].stock -= 1;
    await books[2].save();

    // Dune: -2
    books[3].stock -= 2;
    await books[3].save();

    // Sapiens: -1
    books[4].stock -= 1;
    await books[4].save();

    console.log(`✅ Adjusted Book stocks for Seeded Orders.`);
    return insertedOrders;
};
