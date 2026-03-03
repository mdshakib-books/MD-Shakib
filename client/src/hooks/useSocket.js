import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

export const useSocket = (
    url = import.meta.env.VITE_SOCKET_URL || "http://localhost:8000",
) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const socketIo = io(url, {
            withCredentials: true,
        });

        setSocket(socketIo);

        return () => {
            socketIo.disconnect();
        };
    }, [url]);

    const joinRoom = useCallback(
        (room) => {
            if (socket) socket.emit("joinOrderRoom", room);
        },
        [socket],
    );

    const leaveRoom = useCallback(
        (room) => {
            if (socket) socket.emit("leaveOrderRoom", room);
        },
        [socket],
    );

    return { socket, joinRoom, leaveRoom };
};
