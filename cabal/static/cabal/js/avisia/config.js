// /plugins/Cabal/cabal/static/cabal/js/avisia/config.js

// --- Global Application States ---
let db;
let runtimeCache = { buyers: [], tippers: [] };
let sortDirections = {};

// Pagination & Alphabet Filter States
let currentPage = { buyers: 1, tippers: 1 };
let rowsPerPage = { buyers: 10, tippers: 10 };
let activeLetterFilter = { buyers: 'ALL', tippers: 'ALL' };

// Tracks active color bubble filters for both panels
let activeBubbleFilters = {
    buyers: null,
    tippers: null
};

// 🚫 CUSTOM CUSTOMER BLACKLIST
const nameBlacklist = ['crazycoolcomics', 'mkf1228', 'tafrazie'];

// 👑 Dynamic Templates
const templatesMatrix = {
    1: [
        "Hey {name}! Make sure you check out our next live show on {date}! We have some absolute fire loaded up that you won't want to miss! 🔥",
        "What's up {name}! Set your bookmarks for our upcoming show on {date}! Lots of heat coming your way! 📣👀",
        "Hey {name}, don't forget to catch our next stream happening on {date}! See you in the chat! 🎬🍿"
    ],
    2: [
        "Hey {name}! Thanks so much for your first purchase with us! We truly appreciate your business and support for Just Us Brothers! 📈",
        "Welcome to the crew, {name}! Grabbed your first win with us—thank you so much for the support! 📦✨",
        "Hey {name}, just wanted to drop a huge thank you for making your first purchase with Just Us Brothers today! We appreciate you! 🙏"
    ],
    3: [
        "✨ OMG 1.5K FRIENDS! ✨ We are celebrating BIG! Join the chat on {date} for a brand new BOSS LADY PERFORMANCE 👑, massive SLAB GIVEAWAYS 🛡️, mystery blind bags 🛍️, and Trade Paperback giveaways all stream long! 🔥 Let's goooo!",
        "🎉 1.5K CELEBRATION! 🎉 To celebrate, we are loading up our stream on {date} with certified slabs 💥, epic trade paperbacks 📖, crazy comic BLIND BAGS 🛍️, and a live Boss Lady performance! Set your bookmarks, {name}! 🥳✨",
        "🚨 1.5K CELEBRATION IS LIVE ON {date}! 🚨 Brand new Boss Lady performance? Yes! 👑 Comic blind bags? Packed and ready! 🛍️ Slabs and TPBs? Giving them away! 🚀 Thank you for 1.5k, {name}! 🎉💖",
        "Hey {name}! 🚨 The 1.5K CELEBRATION is officially locked in for {date}! 🚨 We’re turning up the heat with an exclusive Boss Lady performance 👑, mystery comic blind bags 🛍️, slab giveaways 🛡️, and fresh NCBD arrivals! 🔥🚀",
        "We hit 1.5k followers, {name}! 🥳 To show our love, our stream on {date} features a brand new Boss Lady performance 🎤 and mystery blind bag drops along with non-stop slab and TPB giveaways! 📚✨ Don't miss out!",
        "💥 1.5K FOLLOWER PARTY ALERT! 💥 Blind bags? ABSOLUTELY! 🛍️ Boss Lady performance? YOU KNOW IT! 👑 Catch us on {date} for massive milestones, new comic book day releases, and free trade paperbacks! See you there, {name}! 🎉"
    ]
};
