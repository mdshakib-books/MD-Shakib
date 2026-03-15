import Address from "../models/address.model.js";
import { ApiError } from "../utils/ApiError.js";

const ADDRESS_TYPE_VALUES = new Set(["Home", "Office", "Other"]);

const normalizeAddressType = (value) =>
    ADDRESS_TYPE_VALUES.has(value) ? value : "Home";

const withAddressTypeFallback = (address = {}) => ({
    ...address,
    addressType: normalizeAddressType(address.addressType),
});

class AddressService {
    async addAddress(userId, addressData) {
        const payload = {
            ...addressData,
            addressType: normalizeAddressType(addressData?.addressType),
        };

        // If setting as default, unset others
        if (payload.isDefault) {
            await Address.updateMany({ userId }, { isDefault: false });
        } else {
            // If it's the first address, force it to be default
            const count = await Address.countDocuments({ userId });
            if (count === 0) {
                payload.isDefault = true;
            }
        }

        const newAddress = await Address.create({
            ...payload,
            userId,
        });

        return newAddress;
    }

    async getUserAddresses(userId) {
        const addresses = await Address.find({ userId })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean();

        return addresses.map(withAddressTypeFallback);
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

        const normalizedUpdateData = {
            ...updateData,
        };

        if (Object.hasOwn(normalizedUpdateData, "addressType")) {
            normalizedUpdateData.addressType = normalizeAddressType(
                normalizedUpdateData.addressType,
            );
        }

        Object.assign(address, normalizedUpdateData);
        if (!address.addressType) {
            address.addressType = "Home";
        }
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
        if (!address.addressType) {
            address.addressType = "Home";
        }
        await address.save();

        return address;
    }
}

export default new AddressService();
