export const revenueAggregationPipeline = () => {
    return [
        {
            $match: {
                paymentStatus: "Paid",
                orderStatus: { $nin: ["Cancelled", "Returned"] },
            },
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
            },
        },
    ];
};

export const monthlyRevenuePipeline = () => {
    return [
        {
            $match: {
                paymentStatus: "Paid",
                orderStatus: { $nin: ["Cancelled", "Returned"] },
            },
        },
        {
            $group: {
                _id: {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                },
                revenue: { $sum: "$totalAmount" },
                orderCount: { $sum: 1 },
            },
        },
        {
            $sort: { "_id.year": 1, "_id.month": 1 },
        },
    ];
};

export const topSellingBooksPipeline = (limit = 5) => {
    return [
        {
            $match: {
                paymentStatus: "Paid",
                orderStatus: { $nin: ["Cancelled", "Returned"] },
            },
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: "$items.bookId",
                title: { $first: "$items.title" },
                totalSold: { $sum: "$items.quantity" },
                revenueGenerated: {
                    $sum: { $multiply: ["$items.price", "$items.quantity"] },
                },
            },
        },
        { $sort: { totalSold: -1 } },
        { $limit: limit },
    ];
};
