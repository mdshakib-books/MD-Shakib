
import { Link } from "react-router-dom";
import React from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const NotFoundPage = () => {
    return (
            <div className="min-h-screen flex flex-col items-center justify-center from-slate-50 to-blue-100 px-6 text-center">
                <p className="mt-4 text-lg md:text-xl text-gray-600 max-w-md">
                    Oops! The page you are looking for doesn’t exist or has been
                    moved.
                </p>
    
                <div className="mt-5 w-[70%] lg:w-[60%] mx-auto aspect-square max-h-[500px]">
                    <DotLottieReact
                        // src="https://lottie.host/e09cea0f-8c38-4200-9885-c05812644989/6mPoFH5VgZ.lottie"
                        src="https://lottie.host/d287c5f8-ce53-48c3-bf99-1fa3357b31c2/ItmbjNVGh8.lottie"
                        loop
                        autoplay
                    />
                </div>
                {/* Buttons */}
                <div className="flex gap-4 mt-6">
                    <Link
                        to="/"
                        className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium shadow-lg hover:bg-blue-700 hover:scale-105 transition"
                    >
                        Go Home
                    </Link>
    
                    <button
                        onClick={() => window.history.back()}
                        className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 hover:scale-105 transition"
                    >
                        Go Back
                    </button>
                </div>
    
                {/* footer text */}
                <p className="absolute bottom-6 text-sm text-gray-400">
                    © {new Date().getFullYear()} MD-Shakib. All rights reserved.
                </p>
            </div>
        );
};

export default NotFoundPage;
