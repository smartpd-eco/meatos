const DEFAULT_SUPABASE_URL = "https://pkrsiqjzllyiafwpskll.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh";

export const SUPABASE_PUBLIC_CONFIG = {
  url: globalThis.__MEATOS_SUPABASE__?.url ?? DEFAULT_SUPABASE_URL,
  anonKey: globalThis.__MEATOS_SUPABASE__?.anonKey ?? DEFAULT_SUPABASE_ANON_KEY,
  schema: globalThis.__MEATOS_SUPABASE__?.schema ?? "public",
  ocrFunctionUrl:
    globalThis.__MEATOS_SUPABASE__?.ocrFunctionUrl
    ?? buildEdgeFunctionUrl(globalThis.__MEATOS_SUPABASE__?.url ?? DEFAULT_SUPABASE_URL, "analyze-ocr"),
  visionFunctionUrl:
    globalThis.__MEATOS_SUPABASE__?.visionFunctionUrl
    ?? buildEdgeFunctionUrl(globalThis.__MEATOS_SUPABASE__?.url ?? DEFAULT_SUPABASE_URL, "analyze-invoice")
};

function buildEdgeFunctionUrl(supabaseUrl, functionName) {
  try {
    const url = new URL(supabaseUrl);
    return `https://${url.hostname.split(".")[0]}.functions.supabase.co/${functionName}`;
  } catch {
    return "";
  }
}
