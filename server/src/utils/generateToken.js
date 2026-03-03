import jwt from "jsonwebtoken";

export const generateAccessToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
            email: user.email,
            role: user.role,
        },
        process.env.ACCESS_TOKEN_SECRET || "fallback_access_secret",
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
        },
    );
};

export const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
        },
        process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret",
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "10d",
        },
    );
};
