/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXTAUTH_URL: string;
    readonly NEXTAUTH_SECRET: string;
    readonly DATABASE_URL: string;
    readonly FAC_API_KEY: string;
    readonly ANTHROPIC_API_KEY?: string;
  }
}
