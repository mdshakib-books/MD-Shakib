import React from "react";
import { Link } from "react-router-dom";

const EmptyState = ({ message = "No data found", actionText, actionUrl }) => {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            {/* ICON */}
            <div className="mb-6 text-gray-500">
                <svg
                    className="w-20 h-20 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.2}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 
                        2H6a2 2 0 01-2-2v-5m16 
                        0h-2.586a1 1 0 00-.707.293l-2.414 
                        2.414a1 1 0 01-.707.293h-3.172a1 
                        1 0 01-.707-.293l-2.414-2.414A1 
                        1 0 006.586 13H4"
                    />
                </svg>
            </div>

            {/* MESSAGE */}
            <h3 className="text-lg md:text-xl font-medium text-gray-200">
                {message}
            </h3>

            {/* ACTION BUTTON */}
            {actionText && actionUrl && (
                <Link
                    to={actionUrl}
                    className="mt-6 px-6 py-2.5 rounded-lg 
                    bg-[var(--color-primary-gold)] 
                    text-black 
                    font-semibold 
                    hover:bg-[var(--color-accent-gold)] 
                    transition"
                >
                    {actionText}
                </Link>
            )}
        </div>
    );
};

export default EmptyState;
