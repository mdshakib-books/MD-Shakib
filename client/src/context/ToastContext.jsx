import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

let toastId = 0;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback(
        (message, type = "success", duration = 3000) => {
            const id = ++toastId;
            setToasts((prev) => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, duration);
        },
        [],
    );

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}

            {/* Toast Container */}
            <div className="fixed bottom-24 md:bottom-6 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        onClick={() => removeToast(toast.id)}
                        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium animate-slide-up cursor-pointer transition-all
                            ${
                                toast.type === "success"
                                    ? "bg-[#1a1a1a] border border-[var(--color-primary-gold)] text-white"
                                    : toast.type === "error"
                                      ? "bg-[#1a1a1a] border border-red-500 text-red-400"
                                      : "bg-[#1a1a1a] border border-[#2A2A2A] text-gray-300"
                            }`}
                    >
                        {/* Icon */}
                        {toast.type === "success" && (
                            <span className="text-[var(--color-primary-gold)] text-base">
                                🛒
                            </span>
                        )}
                        {toast.type === "error" && (
                            <span className="text-red-400 text-base">✕</span>
                        )}
                        {toast.type === "info" && (
                            <span className="text-gray-400 text-base">ℹ</span>
                        )}
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
};
