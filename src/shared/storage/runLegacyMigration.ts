// Imported first by main.tsx: ES modules evaluate imports before the importing module's body, so
// running the key migration as a side effect here guarantees no other module reads storage first.
import { migrateLegacyStorage } from "./legacyMigration.ts";

migrateLegacyStorage();
