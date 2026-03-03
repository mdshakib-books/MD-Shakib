import React from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSocket } from "../../hooks/useSocket.js";

const Dashboard = () => {
    const { user, logout } = useAuth();
    const { socket } = useSocket();

    return (
        <div style={{ padding: "2rem" }}>
            <h1>Dashboard</h1>
            {user ? (
                <>
                    <p>Welcome, {user.username || user.email}!</p>
                    <button onClick={logout}>Logout</button>
                    {socket ? (
                        <p style={{ color: "green" }}>Socket Connected</p>
                    ) : (
                        <p style={{ color: "red" }}>Socket Disconnected</p>
                    )}
                </>
            ) : (
                <p>Please log in.</p>
            )}
        </div>
    );
};

export default Dashboard;
