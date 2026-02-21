require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { Chess } = require("chess.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN олдсонгүй (.env шалга)");

const bot = new Telegraf(BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

// Хэрэглэгчийн дата (RAM дээр) — bot restart хийхэд алга болно
const users = {}; // { [id]: { diamond: number, chess: Chess|null, inChess: boolean } }

// Доод гар (reply keyboard)
const menu = Markup.keyboard([
  ["♟ Шатар", "⚔️ Battle"],
  ["💼 Wallet", "🛒 Shop"],
  ["➕ Add Diamond", "➖ Spend Diamond"],
]).resize();

function getUser(id) {
  if (!users[id]) users[id] = { diamond: 0, chess: null, inChess: false };
  return users[id];
}

// ---------- START ----------
bot.start((ctx) => {
  getUser(ctx.from.id);
  ctx.reply("🎮 Cash Battle бот ажиллаж эхэллээ!", menu);
});

// ---------- WALLET / DIAMOND ----------
bot.hears("💼 Wallet", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(`💎 Diamond: ${u.diamond}`, menu);
});

bot.hears("➕ Add Diamond", (ctx) => {
  const u = getUser(ctx.from.id);
  u.diamond += 10;
  ctx.reply(`✅ +10 Diamond нэмлээ!\nОдоогийн: 💎 ${u.diamond}`, menu);
});

bot.hears("➖ Spend Diamond", (ctx) => {
  const u = getUser(ctx.from.id);
  if (u.diamond < 5) return ctx.reply("⛔ Diamond хүрэлцэхгүй байна (5 хэрэгтэй).", menu);
  u.diamond -= 5;
  ctx.reply(`✅ -5 Diamond зарцууллаа!\nОдоогийн: 💎 ${u.diamond}`, menu);
});

// ---------- ADMIN /add ----------
bot.command("add", (ctx) => {
  if (!ADMIN_ID) return ctx.reply("ADMIN_ID .env дээр байхгүй байна");
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Та admin биш байна");

  const args = (ctx.message.text || "").trim().split(/\s+/);
  if (args.length < 3) return ctx.reply("Зөв бич: /add userId amount");

  const userId = Number(args[1]);
  const amount = Number(args[2]);
  if (!Number.isFinite(userId) || !Number.isFinite(amount)) {
    return ctx.reply("userId/amount буруу байна");
  }

  const u = getUser(userId);
  u.diamond += amount;

  ctx.reply(`✅ ${userId} хэрэглэгчид ${amount} diamond нэмлээ.\nОдоо: 💎 ${u.diamond}`);
});

// ---------- CHESS (чат дээр тоглох) ----------
bot.hears("♟ Шатар", (ctx) => {
  const u = getUser(ctx.from.id);
  u.chess = new Chess();
  u.inChess = true;

  // Хэрвээ WebApp товч хэрэгтэй бол доорх 2 мөрийг идэвхжүүлээд URL-аа зөв тавь
  // const webAppUrl = "https://YOUR_DOMAIN/chess.html";
  // return ctx.reply("♟ Шатар эхэллээ!\nНүүдэл бич: e2e4 эсвэл e2 e4\n(Гарах: /exit)", Markup.inlineKeyboard([Markup.button.webApp("♟ Play Chess (Web)", webAppUrl)]));

  ctx.reply("♟ Шатар эхэллээ!\nНүүдэл бич: e2e4 эсвэл e2 e4\n(Гарах: /exit)", menu);
});

bot.command("exit", (ctx) => {
  const u = getUser(ctx.from.id);
  u.inChess = false;
  u.chess = null;
  ctx.reply("✅ Шатраас гарлаа.", menu);
});

// Нүүдэл боловсруулах (e2e4 / e2 e4)
bot.on("text", (ctx) => {
  const u = getUser(ctx.from.id);
  const text = (ctx.message.text || "").trim();

  // menu товчлууруудыг дахин боловсруулалгүй буцаана
  if (["💼 Wallet", "➕ Add Diamond", "➖ Spend Diamond", "♟ Шатар", "⚔️ Battle", "🛒 Shop"].includes(text)) return;

  if (!u.inChess || !u.chess) return;

  const moveStr = text.replace(/\s+/g, ""); // "e2 e4" -> "e2e4"
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveStr)) {
    return ctx.reply("❗ Нүүдэл буруу формат. Ж: e2e4 эсвэл e2 e4", menu);
  }

  const from = moveStr.slice(0, 2);
  const to = moveStr.slice(2, 4);
  const promo = moveStr.slice(4, 5);

  const move = u.chess.move({ from, to, promotion: promo || "q" });
  if (!move) return ctx.reply("⛔ Энэ нүүдэл боломжгүй байна.", menu);

  const status =
    u.chess.isCheckmate() ? "🏁 Checkmate!" :
    u.chess.isCheck() ? "✅ Check!" :
    u.chess.isDraw() ? "🤝 Draw!" :
    "✅ Нүүдэл боллоо.";

  ctx.reply(`${status}\nFEN:\n${u.chess.fen()}`, menu);
});

// ---------- OTHER ----------
bot.hears("⚔️ Battle", (ctx) => ctx.reply("Battle mode удахгүй ➡️", menu));
bot.hears("🛒 Shop", (ctx) => ctx.reply("Shop удахгүй ➡️", menu));

bot.catch((err) => console.log("BOT ERROR:", err));

bot.launch();
console.log("✅ Bot ажиллаж байна");