const { supabaseAdmin } = require("../supabase/client");

// Startup үед DB шалгаад terminal дээр хэвлэх
async function checkDatabaseConnection() {
  try {
    const sb = supabaseAdmin;

    if (!sb) {
      console.log("⚠️ No service role key, skipping DB admin check");
      return;
    }

    const { error } = await sb.from("profiles").select("*").limit(1);

    if (error) {
      console.error("❌ Database connection failed:", error.message);
    } else {
      console.log("✅ Database connection success");
    }
  } catch (e) {
    console.error("❌ Database connection error:", e.message);
  }
}

module.exports = checkDatabaseConnection;
