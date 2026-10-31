// Set by the requireAuth middleware for authenticated requests
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        // The user's IANA timezone: decides what "today" is for billing dates
        timezone: string;
      };
    }
  }
}

export {};
