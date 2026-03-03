let io;

export const setOrderSocketInstance = (socketIoInstance) => {
    io = socketIoInstance;
};

export const setupOrderSockets = (socketIoInstance, socket) => {
    io = socketIoInstance;

    // User joins their own personal room
    socket.on("join_user_room", (userId) => {
        socket.join(userId.toString());
    });

    // Admins join admin room
    socket.on("join_admin_room", () => {
        socket.join("admin_room");
    });
};

// Push live order to any connected Admin frontend
export const emitNewOrder = (order) => {
    if (io) {
        io.to("admin_room").emit("new_order_received", order);
    }
};

// Notify the specific user regarding their status
export const emitOrderStatusUpdated = (order) => {
    if (io) {
        io.to(order.userId.toString()).emit("order_status_updated", {
            orderId: order._id,
            status: order.orderStatus,
        });
    }
};

export const emitPaymentSuccess = (orderId) => {
    if (io) {
        io.emit(`payment_success_${orderId}`, { success: true });
    }
};

export const emitPaymentFailed = (orderId, reason) => {
    if (io) {
        io.emit(`payment_failed_${orderId}`, { success: false, reason });
    }
};
