import React from "react";

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Error caught by boundary:", error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }

    resetError = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 px-4">
                    <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg">
                        <div className="text-center mb-6">
                            <h1 className="text-3xl font-bold text-red-600 mb-4">
                                ⚠️ Something went wrong
                            </h1>
                            <p className="text-gray-600 text-sm mb-4">
                                An unexpected error occurred. Please try
                                refreshing the page or contact support if the
                                problem persists.
                            </p>
                            {process.env.NODE_ENV === "development" && (
                                <details className="text-left mb-4">
                                    <summary className="cursor-pointer text-red-600 text-sm font-medium">
                                        Error Details
                                    </summary>
                                    <pre className="mt-2 bg-gray-100 p-2 text-xs overflow-auto max-h-40">
                                        {this.state.error?.toString()}
                                        {"\n"}
                                        {this.state.errorInfo?.componentStack}
                                    </pre>
                                </details>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={this.resetError}
                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm font-medium"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={() => (window.location.href = "/")}
                                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition text-sm font-medium"
                            >
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
