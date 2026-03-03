import Address from "../src/models/address.model.js";

export const seedAddresses = async (users) => {
    console.log("Seeding Addresses...");

    const addresses = [];

    // Give John Doe 2 addresses, make the first one default
    addresses.push({
        userId: users[0]._id,
        fullName: users[0].name,
        phone: users[0].phone,
        pincode: "110001",
        state: "Delhi",
        city: "New Delhi",
        houseNo: "Flat 101",
        area: "Connaught Place",
        landmark: "Near Metro",
        isDefault: true,
    });

    addresses.push({
        userId: users[0]._id,
        fullName: `${users[0].name} (Office)`,
        phone: "0112222333",
        pincode: "110002",
        state: "Delhi",
        city: "New Delhi",
        houseNo: "Tower B, 4th Floor",
        area: "Cyber Hub",
        isDefault: false,
    });

    // Give Jane Smith 1 address
    addresses.push({
        userId: users[1]._id,
        fullName: users[1].name,
        phone: users[1].phone,
        pincode: "400001",
        state: "Maharashtra",
        city: "Mumbai",
        houseNo: "Apt 5",
        area: "Andheri West",
        isDefault: true,
    });

    // Give Bob Wilson 1 address
    addresses.push({
        userId: users[2]._id,
        fullName: users[2].name,
        phone: users[2].phone,
        pincode: "560001",
        state: "Karnataka",
        city: "Bengaluru",
        houseNo: "Villa 12",
        area: "Koramangala",
        isDefault: true,
    });

    const insertedAddresses = await Address.insertMany(addresses);
    console.log(`✅ Seeded ${insertedAddresses.length} Addresses.`);
    return insertedAddresses;
};
