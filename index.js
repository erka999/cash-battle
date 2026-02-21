const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const users = {};

const menu = Markup.keyboard([
  ["♟ Шатар", "⚔️ Battle"],
  ["💼 Wallet", "🛒 Shop"],
  ["➕ Add Diamond", "➖ Spend Diamond"],
]).resize();

function getUser(id) {
  if (!users[id]) users[id] = { diamond: 0 };
  return users[id];
}

bot.start((ctx) => {
  const id = ctx.from.id;
  getUser(id);
  ctx.reply("🎮 Cash Battle бот ажиллаж эхэллээ!", menu);
});

bot.hears("💼 Wallet", (ctx) => {
  const id = ctx.from.id;
  const u = getUser(id);
  ctx.reply(`💎 Diamond: ${u.diamond}`, menu);
});

bot.hears("➕ Add Diamond", (ctx) => {
  const id = ctx.from.id;
  const u = getUser(id);
  u.diamond += 10; // +10
  ctx.reply(`✅ +10 Diamond нэмлээ!\nОдоогийн: 💎 ${u.diamond}`, menu);
});

bot.hears("➖ Spend Diamond", (ctx) => {
  const id = ctx.from.id;
  const u = getUser(id);

  if (u.diamond < 5) {
    return ctx.reply("⛔ Diamond хүрэлцэхгүй байна (хамгийн багадаа 5 хэрэгтэй).", menu);
  }

  u.diamond -= 5; // -5
  ctx.reply(`✅ -5 Diamond зарцууллаа!\nОдоогийн: 💎 ${u.diamond}`, menu);
});

bot.hears("♟ Шатар", (ctx) => ctx.reply("Шатар matchmaking удахгүй ➡️", menu));
bot.hears("⚔️ Battle", (ctx) => ctx.reply("Battle mode удахгүй ➡️", menu));
bot.hears("🛒 Shop", (ctx) => ctx.reply("Shop удахгүй ➡️", menu));

bot.catch((err) => console.log("BOT ERROR:", err));
const ADMIN_ID = 1447898360; // энд өөрийн myid-г тавина
bot.command("add", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Та admin биш байна");
  }

  const args = ctx.message.text.trim().split(/\s+/);
  if (args.length < 3) return ctx.reply("Зөв бич: /add userId amount");

  const userId = Number(args[1]);
  const amount = Number(args[2]);

  if (!users[userId]) users[userId] = { diamond: 0 };
  users[userId].diamond += amount;

  return ctx.reply(`✅ ${userId} хэрэглэгчид ${amount} diamond нэмлээ`);
});

bot.launch()
console.log("✅ Bot ажиллаж байна");





