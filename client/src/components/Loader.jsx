import React from "react";

const Loader = ({ fullScreen = false }) => {
    return (
        <div
            className={`flex justify-center items-center ${fullScreen ? "h-screen" : "py-8"}`}
        >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );
};

export default Loader;
