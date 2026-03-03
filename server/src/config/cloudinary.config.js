import { v2 as cloudinary } from "cloudinary";

// Configure cloudinary explicitly
// It will auto-pick from process.env if available, but doing it explicitly guarantees clarity
export const configureCloudinary = () => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
};
