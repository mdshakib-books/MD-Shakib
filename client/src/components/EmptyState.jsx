import React from "react";
import { Link } from "react-router-dom";

const EmptyState = ({ message = "No data found", actionText, actionUrl }) => {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-gray-400 mb-4">
                <svg
                    className="w-16 h-16 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">{message}</h3>
            {actionText && actionUrl && (
                <Link
                    to={actionUrl}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                    {actionText}
                </Link>
            )}
        </div>
    );
};

export default EmptyState;
