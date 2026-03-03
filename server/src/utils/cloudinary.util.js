import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { ApiError } from "./ApiError.js";

/**
 * Uploads a local file to Cloudinary and deletes the local copy.
 * @param {string} localFilePath - The absolute path to the local file.
 * @param {string} folderName - The Cloudinary folder to organize uploads (e.g., 'books', 'users').
 * @returns {Promise<string>} The secure URL of the uploaded image.
 */
export const uploadOnCloudinary = async (
    localFilePath,
    folderName = "general",
) => {
    try {
        if (!localFilePath) return null;

        // Upload the file to Cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            folder: `shakib_ecommerce/${folderName}`,
        });

        // File has been uploaded successfully
        // Safely remove the locally saved temporary file
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return response.secure_url;
    } catch (error) {
        // Remove the locally saved temporary file as the upload operation failed
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        console.error("Cloudinary upload failed", error);
        throw new ApiError(500, "Error uploading file to Cloudinary");
    }
};

/**
 * Deletes a file from Cloudinary using its secure URL.
 * @param {string} FileUrl - The secure URL of the existing Cloudinary image.
 */
export const deleteFromCloudinary = async (FileUrl) => {
    try {
        if (!FileUrl) return;

        // Extract the public ID from the URL roughly
        // e.g., https://res.cloudinary.com/.../image/upload/v1234/shakib_ecommerce/books/xyz.jpg
        // -> shakib_ecommerce/books/xyz
        const urlParts = FileUrl.split("/");
        const versionIndex = urlParts.findIndex(
            (part) => part.startsWith("v") && !isNaN(part.substring(1)),
        );

        let publicId = "";
        if (versionIndex !== -1 && versionIndex < urlParts.length - 1) {
            publicId = urlParts.slice(versionIndex + 1).join("/");
            // Remove the file extension
            publicId = publicId.substring(0, publicId.lastIndexOf("."));
        }

        if (publicId) {
            await cloudinary.uploader.destroy(publicId);
        }
    } catch (error) {
        console.error("Cloudinary deletion failed", error);
        // We typically don't throw here to prevent blocking main workflows (like deleting a book)
        // just because the image deletion failed silently.
    }
};
