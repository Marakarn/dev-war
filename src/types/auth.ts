import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      queueKey?: string
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    queueKey?: string
  }

  interface JWT {
    id: string
    queueKey?: string
  }
}
