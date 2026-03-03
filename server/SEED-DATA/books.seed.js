import Book from "../src/models/book.model.js";

export const seedBooks = async () => {
    console.log("Seeding Books...");

    const books = await Book.insertMany([
        {
            title: "The Silent Patient",
            author: "Alex Michaelides",
            description:
                "A shocking psychological thriller of a woman's act of violence against her husband.",
            price: 499,
            stock: 50,
            category: "Thriller",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book1.jpg",
            isActive: true,
        },
        {
            title: "Atomic Habits",
            author: "James Clear",
            description:
                "No matter your goals, Atomic Habits offers a proven framework for improving.",
            price: 699,
            stock: 120,
            category: "Self-Help",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book2.jpg",
            isActive: true,
        },
        {
            title: "1984",
            author: "George Orwell",
            description:
                "Among the seminal texts of the 20th century, Nineteen Eighty-Four is a rare work.",
            price: 399,
            stock: 30,
            category: "Fiction",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book3.jpg",
            isActive: true,
        },
        {
            title: "Dune",
            author: "Frank Herbert",
            description:
                "A stunning blend of adventure and mysticism, environmentalism and politics.",
            price: 899,
            stock: 45,
            category: "Sci-Fi",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book4.jpg",
            isActive: true,
        },
        {
            title: "Sapiens",
            author: "Yuval Noah Harari",
            description: "A brief history of humankind.",
            price: 799,
            stock: 60,
            category: "History",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book5.jpg",
            isActive: true,
        },
        {
            title: "The Alchemist",
            author: "Paulo Coelho",
            description:
                "Paulo Coelho's enchanting novel has inspired a devoted following around the world.",
            price: 450,
            stock: 200,
            category: "Philosophy",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book6.jpg",
            isActive: true,
        },
        {
            title: "Project Hail Mary",
            author: "Andy Weir",
            description: "A lone astronaut must save the earth from disaster.",
            price: 999,
            stock: 80,
            category: "Sci-Fi",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book7.jpg",
            isActive: true,
        },
        {
            title: "Deep Work",
            author: "Cal Newport",
            description: "Rules for focused success in a distracted world.",
            price: 550,
            stock: 90,
            category: "Self-Help",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book8.jpg",
            isActive: true,
        },
        {
            title: "The Midnight Library",
            author: "Matt Haig",
            description:
                "Between life and death there is a library, and within that library, the shelves go on forever.",
            price: 650,
            stock: 40,
            category: "Fiction",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book9.jpg",
            isActive: true,
        },
        {
            title: "OutofStock Novel",
            author: "Anonymous",
            description:
                "This book should be active but have 0 stock for frontend testing.",
            price: 299,
            stock: 0,
            category: "Fiction",
            imageUrl:
                "https://res.cloudinary.com/demo/image/upload/c_scale,w_500/v1/book10.jpg",
            isActive: true,
        },
    ]);

    console.log(`✅ Seeded ${books.length} Books.`);
    return books;
};
