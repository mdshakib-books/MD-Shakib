import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

export const useSocket = (
    url = import.meta.env.VITE_SOCKET_URL || "http://localhost:8000",
) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const socketIo = io(url, {
            withCredentials: true,
            transports: ["websocket", "polling"],
        });

        setSocket(socketIo);

        return () => {
            socketIo.disconnect();
        };
    }, [url]);

    const joinUserRoom = useCallback(
        (userId) => {
            if (!socket || !userId) return;
            socket.emit("join_user_room", userId);
        },
        [socket],
    );

    const joinAdminRoom = useCallback(() => {
        if (socket) socket.emit("join_admin_room");
    }, [socket]);

    const joinRoom = useCallback(
        (room) => {
            if (!socket || !room) return;
            // Backward-compatible join for arbitrary room names.
            socket.emit("joinOrderRoom", room);
        },
        [socket],
    );

    const leaveRoom = useCallback(
        (room) => {
            if (socket) socket.emit("leaveOrderRoom", room);
        },
        [socket],
    );

    return { socket, joinUserRoom, joinAdminRoom, joinRoom, leaveRoom };
};
