import NextAuth from "next-auth"
import { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  providers: [],
  session: {
    strategy: "jwt",
    maxAge: 60 * 10, // 10 minutes
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.queueKey = (user as any).queueKey
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(session.user as any).queueKey = token.queueKey as string
      }
      return session
    },
  },
  pages: {
    signIn: "/waitingQueue",
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
