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

    // Legacy alias for older frontend implementations.
    socket.on("joinOrderRoom", (room) => {
        if (room) socket.join(room.toString());
    });

    // Admins join admin room
    socket.on("join_admin_room", () => {
        socket.join("admin_room");
    });
};

const serializeOrderEvent = (order) => ({
    orderId: order?._id?.toString?.() || String(order?._id || ""),
    userId: order?.userId?._id?.toString?.() || order?.userId?.toString?.(),
    orderStatus: order?.orderStatus,
    paymentStatus: order?.paymentStatus,
    paymentMethod: order?.paymentMethod,
    replacementStatus: order?.replacement?.replacementStatus || "None",
    updatedAt: new Date().toISOString(),
    order,
});

// Push live order to any connected Admin frontend
export const emitNewOrder = (order) => {
    if (io) {
        const payload = serializeOrderEvent(order);
        io.to("admin_room").emit("orderCreated", payload);
        io.to("admin_room").emit("new_order_received", order); // legacy
    }
};

// Notify the specific user regarding their status
export const emitOrderStatusUpdated = (order) => {
    if (io) {
        const payload = serializeOrderEvent(order);
        const userRoom = payload.userId;
        if (userRoom) {
            io.to(userRoom).emit("orderStatusUpdated", payload);
            io.to(userRoom).emit("order_status_updated", {
                orderId: payload.orderId,
                status: payload.orderStatus,
            }); // legacy
        }
        io.to("admin_room").emit("orderStatusUpdated", payload);
    }
};

export const emitPaymentUpdated = (order) => {
    if (io) {
        const payload = serializeOrderEvent(order);
        const userRoom = payload.userId;
        if (userRoom) {
            io.to(userRoom).emit("paymentUpdated", payload);
        }
        io.to("admin_room").emit("paymentUpdated", payload);
    }
};

export const emitReplacementUpdated = (order) => {
    if (io) {
        const payload = serializeOrderEvent(order);
        const userRoom = payload.userId;
        if (userRoom) {
            io.to(userRoom).emit("replacementUpdated", payload);
        }
        io.to("admin_room").emit("replacementUpdated", payload);
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
