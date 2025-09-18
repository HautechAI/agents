import * as dotenv from "dotenv";
dotenv.config();

export class ConfigService {
  getOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY not set in .env");
    }
    return key;
  }

  getGitHubToken(): string {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GH_TOKEN (or GITHUB_TOKEN) not set in .env");
    }
    return token;
  }
}
