import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const supportCategories = [
    "Order Information",
    "Return / Replacement",
    "Delivery / Shipping",
    "Cancellation / Modify",
    "Refunds",
    "Coupons",
    "Account Help",
    "Other Queries",
];

const faqData = [
    {
        question: "How can I check the status of my order?",
        answer: "You can check your order status by visiting the Orders page in your account dashboard.",
    },
    {
        question: "How do I know if my order is confirmed?",
        answer: "Once your order is placed successfully, you will receive an order confirmation message or email.",
    },
    {
        question: "What is the minimum order value?",
        answer: "Currently there is no minimum order value required to place an order.",
    },
    {
        question: "Do you deliver outside India?",
        answer: "Currently we deliver within India only. International shipping will be added soon.",
    },
    {
        question: "Is it mandatory to create an account?",
        answer: "No, but creating an account helps you track orders and manage purchases easily.",
    },
    {
        question: "How do I cancel my order?",
        answer: "You can cancel your order from the Orders section before it gets shipped.",
    },
    {
        question: "What is the shipping cost?",
        answer: "Shipping charges depend on your delivery location and will be shown at checkout.",
    },
    {
        question: "How do I request a refund?",
        answer: "Refund requests can be submitted from the Orders page if the order is eligible.",
    },
];

const SupportPage = () => {
    const [activeIndex, setActiveIndex] = useState(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const toggleFAQ = (index) => {
        setActiveIndex(activeIndex === index ? null : index);
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
            <Navbar />

            <main className="flex-grow">
                {/* HERO */}
                <section className="py-[100px] text-center border-b border-[#2A2A2A]">
                    <div className="max-w-[900px] mx-auto px-6">
                        <h1 className="text-3xl md:text-5xl font-heading text-[#C9A24A] mb-6">
                            Support Center
                        </h1>

                        <p className="text-gray-400 text-sm md:text-lg">
                            Need help? Browse help topics or find answers in our
                            frequently asked questions.
                        </p>
                    </div>
                </section>

                {/* SUPPORT CONTENT */}
                <section className="py-[70px]">
                    <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-[260px_1fr] gap-10">
                        {/* SIDEBAR */}
                        <div className="space-y-3">
                            {supportCategories.map((item, index) => (
                                <div
                                    key={index}
                                    className="p-4 border border-[#2A2A2A] rounded-lg bg-[#111111] hover:border-[#C9A24A] transition cursor-pointer text-sm"
                                >
                                    {item}
                                </div>
                            ))}
                        </div>

                        {/* FAQ CONTENT */}
                        <div>
                            <h2 className="text-2xl font-heading text-[#C9A24A] mb-8">
                                Frequently Asked Questions
                            </h2>

                            <div className="space-y-4">
                                {faqData.map((faq, index) => (
                                    <div
                                        key={index}
                                        className="border border-[#2A2A2A] rounded-lg overflow-hidden"
                                    >
                                        <button
                                            onClick={() => toggleFAQ(index)}
                                            className="w-full text-left p-5 flex justify-between items-center bg-[#111111] hover:bg-[#151515]"
                                        >
                                            <span className="text-sm md:text-base">
                                                {faq.question}
                                            </span>

                                            <span className="text-[#C9A24A] text-lg">
                                                {activeIndex === index
                                                    ? "-"
                                                    : "+"}
                                            </span>
                                        </button>

                                        {activeIndex === index && (
                                            <div className="p-5 text-gray-400 text-sm border-t border-[#2A2A2A]">
                                                {faq.answer}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* CONTACT HELP */}
                <section className="py-[80px] text-center border-t border-[#2A2A2A] bg-[#111111]">
                    <div className="max-w-[700px] mx-auto px-6">
                        <h2 className="text-2xl md:text-3xl font-heading text-[#C9A24A] mb-4">
                            Still Need Help?
                        </h2>

                        <p className="text-gray-400 mb-6 text-sm md:text-base">
                            If you cannot find the answer to your question, feel
                            free to contact our support team.
                        </p>

                        <button className="px-8 py-3 bg-[#C9A24A] text-black rounded-lg font-semibold hover:bg-[#E5C87B] transition">
                            Contact Support
                        </button>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default SupportPage;
