// Public feature flags and operator data. Expo only inlines EXPO_PUBLIC_*
// values accessed literally, so each one is listed explicitly. These are
// switches and public facts only; provider API keys live in Supabase Edge
// Function secrets and never reach the client bundle.
import { readOperatorConfig } from '../legal/operator';

export const features = {
  /** Calls the stuora-assistant Edge Function (Groq → Cloudflare → rules). */
  aiAssistant: process.env.EXPO_PUBLIC_STUORA_AI_ASSISTANT === 'enabled',
  /** Shows licensed Jobs/Events feeds from the external-data Edge Function. */
  externalFeeds: process.env.EXPO_PUBLIC_STUORA_EXTERNAL_FEEDS === 'enabled',
  /** Lets the city picker check a name against OpenStreetMap Nominatim. */
  cityLookup: process.env.EXPO_PUBLIC_STUORA_CITY_LOOKUP === 'enabled',
};

export const operator = readOperatorConfig({
  EXPO_PUBLIC_STUORA_OPERATOR_NAME: process.env.EXPO_PUBLIC_STUORA_OPERATOR_NAME,
  EXPO_PUBLIC_STUORA_OPERATOR_ADDRESS: process.env.EXPO_PUBLIC_STUORA_OPERATOR_ADDRESS,
  EXPO_PUBLIC_STUORA_OPERATOR_EMAIL: process.env.EXPO_PUBLIC_STUORA_OPERATOR_EMAIL,
  EXPO_PUBLIC_STUORA_OPERATOR_REPRESENTATIVE: process.env.EXPO_PUBLIC_STUORA_OPERATOR_REPRESENTATIVE,
  EXPO_PUBLIC_STUORA_OPERATOR_REGISTER: process.env.EXPO_PUBLIC_STUORA_OPERATOR_REGISTER,
  EXPO_PUBLIC_STUORA_OPERATOR_VAT_ID: process.env.EXPO_PUBLIC_STUORA_OPERATOR_VAT_ID,
  EXPO_PUBLIC_STUORA_PRIVACY_CONTACT: process.env.EXPO_PUBLIC_STUORA_PRIVACY_CONTACT,
  EXPO_PUBLIC_STUORA_SUPERVISORY_AUTHORITY: process.env.EXPO_PUBLIC_STUORA_SUPERVISORY_AUTHORITY,
  EXPO_PUBLIC_STUORA_LEGAL_REVIEWED: process.env.EXPO_PUBLIC_STUORA_LEGAL_REVIEWED,
});
