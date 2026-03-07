import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppRoutes from "./routes/AppRoutes";
import MobileBottomNav from "./components/MobileBottomNav";

function App() {
    return (
        <ErrorBoundary>
            <Provider store={store}>
                <Router>
                    <AuthProvider>
                        <ToastProvider>
                            <div className="pb-[70px] md:pb-0 relative min-h-screen">
                                <AppRoutes />
                                <MobileBottomNav />
                            </div>
                        </ToastProvider>
                    </AuthProvider>
                </Router>
            </Provider>
        </ErrorBoundary>
    );
}

export default App;
