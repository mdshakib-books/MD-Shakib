import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppRoutes from "./routes/AppRoutes";

function App() {
    return (
        <ErrorBoundary>
            <Provider store={store}>
                <Router>
                    <AuthProvider>
                        <AppRoutes />
                    </AuthProvider>
                </Router>
            </Provider>
        </ErrorBoundary>
    );
}

export default App;
