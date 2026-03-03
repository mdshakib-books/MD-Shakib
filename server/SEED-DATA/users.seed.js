import User from "../src/models/user.model.js";
import { hashPassword } from "../src/utils/hashPassword.js";

export const seedUsers = async () => {
    console.log("Seeding Users...");

    // Create Admin
    const adminPassword = await hashPassword("admin123");
    const adminUser = await User.create({
        name: "Admin User",
        email: "admin@test.com",
        password: adminPassword,
        role: "admin",
        phone: "9999999999",
        isBlocked: false,
    });

    // Create Normal Users
    const userPassword = await hashPassword("user123");
    const normalUsers = await User.insertMany([
        {
            name: "John Doe",
            email: "john@test.com",
            password: userPassword,
            role: "user",
            phone: "8888888888",
            isBlocked: false,
        },
        {
            name: "Jane Smith",
            email: "jane@test.com",
            password: userPassword,
            role: "user",
            phone: "7777777777",
            isBlocked: false,
        },
        {
            name: "Bob Wilson",
            email: "bob@test.com",
            password: userPassword,
            role: "user",
            phone: "6666666666",
            isBlocked: false,
        },
    ]);

    console.log(`✅ Seeded 1 Admin & ${normalUsers.length} Normal Users.`);

    return {
        adminUser,
        normalUsers,
    };
};
