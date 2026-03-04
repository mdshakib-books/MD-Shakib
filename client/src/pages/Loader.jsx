import React from "react";
import styled from "styled-components";

const Loader = () => {
    return (
        <StyledWrapper>
            <div className="loader-wrapper">
                <div className="loader">
                    <div />
                    <div />
                    <div />
                    <div />
                    <div />
                </div>

                <p className="loading-text mt-20">
                    Loading<span className="dots"></span>
                </p>
            </div>
        </StyledWrapper>
    );
};

const StyledWrapper = styled.div`
    width: 100%;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;

    .loader-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }

    .loader {
        position: relative;
        width: 40px;
        height: 40px;
        perspective: 80px;
    }

    .loader div {
        width: 100%;
        height: 100%;
        background: #2f3545;
        position: absolute;
        left: 50%;
        transform-origin: left;
        animation: loader 2s infinite;
    }

    .loader div:nth-child(1) {
        animation-delay: 0.15s;
    }
    .loader div:nth-child(2) {
        animation-delay: 0.3s;
    }
    .loader div:nth-child(3) {
        animation-delay: 0.45s;
    }
    .loader div:nth-child(4) {
        animation-delay: 0.6s;
    }
    .loader div:nth-child(5) {
        animation-delay: 0.75s;
    }

    @keyframes loader {
        0% {
            transform: rotateY(0deg);
        }
        50%,
        80% {
            transform: rotateY(-180deg);
        }
        90%,
        100% {
            opacity: 0;
            transform: rotateY(-180deg);
        }
    }

    /* Loading Text */
    .loading-text {
        color: #9ca3af;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.5px;
    }

    .dots::after {
        content: "";
        animation: dots 1.5s steps(3, end) infinite;
    }

    @keyframes dots {
        0% {
            content: "";
        }
        33% {
            content: ".";
        }
        66% {
            content: "..";
        }
        100% {
            content: "...";
        }
    }

    /* Desktop */
    @media (min-width: 1024px) {
        .loader {
            width: 55px;
            height: 55px;
            perspective: 120px;
        }

        .loading-text {
            font-size: 16px;
        }
    }

    /* Mobile */
    @media (max-width: 480px) {
        .loader {
            width: 35px;
            height: 35px;
        }

        .loading-text {
            font-size: 13px;
        }
    }
`;

export default Loader;
