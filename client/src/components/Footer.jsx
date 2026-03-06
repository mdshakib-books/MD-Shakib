import React from "react";

const Footer = () => {
    return (
        <footer className="bg-gray-800 text-white p-6 mt-10">
            <div className="container mx-auto text-center">
                <p>
                    &copy; {new Date().getFullYear()} MD Shakib Islamic Books.
                    All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;
