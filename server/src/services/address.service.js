import Address from "../models/address.model.js";
import { ApiError } from "../utils/ApiError.js";

class AddressService {
    async addAddress(userId, addressData) {
        // If setting as default, unset others
        if (addressData.isDefault) {
            await Address.updateMany({ userId }, { isDefault: false });
        } else {
            // If it's the first address, force it to be default
            const count = await Address.countDocuments({ userId });
            if (count === 0) {
                addressData.isDefault = true;
            }
        }

        const newAddress = await Address.create({
            ...addressData,
            userId,
        });

        return newAddress;
    }

    async getUserAddresses(userId) {
        return await Address.find({ userId })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean();
    }

    async updateAddress(userId, addressId, updateData) {
        const address = await Address.findOne({ _id: addressId, userId });

        if (!address) {
            throw new ApiError(404, "Address not found or unauthorized");
        }

        if (updateData.isDefault) {
            await Address.updateMany(
                { userId, _id: { $ne: addressId } },
                { isDefault: false },
            );
        }

        Object.assign(address, updateData);
        await address.save();
        return address;
    }

    async deleteAddress(userId, addressId) {
        const address = await Address.findOne({ _id: addressId, userId });

        if (!address) {
            throw new ApiError(404, "Address not found or unauthorized");
        }

        if (address.isDefault) {
            const otherAddress = await Address.findOne({
                userId,
                _id: { $ne: addressId },
            });
            if (otherAddress) {
                otherAddress.isDefault = true;
                await otherAddress.save();
            } else {
                // It's technically okay to delete the last default address if it's the ONLY address
            }
        }

        await Address.deleteOne({ _id: addressId });
        return true;
    }

    async setDefaultAddress(userId, addressId) {
        const address = await Address.findOne({ _id: addressId, userId });

        if (!address) {
            throw new ApiError(404, "Address not found or unauthorized");
        }

        // Reset all
        await Address.updateMany({ userId }, { isDefault: false });

        // Set target
        address.isDefault = true;
        await address.save();

        return address;
    }
}

export default new AddressService();
