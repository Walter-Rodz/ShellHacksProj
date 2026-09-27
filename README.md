This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Connecting to the backend

The console pages get their data from the backend (the `backend/` folder on the `Backend` branch):

- `/collection`: browse all consoles, filters, AI Builder, and the "Ask AI" chat
- `/my-collection`: the user's collection and price tracking, saved in their browser (no accounts)

By default the site calls the backend at `http://localhost:4000`. To use a different address (for example a hosted
backend), create a file named `.env.local` in this folder:

```
NEXT_PUBLIC_API_URL=https://your-backend-address
```

Then restart `npm run dev`. The backend must allow the site's address in its `CORS_ORIGINS` setting.

Console photos live in `public/images/consoles/`. `app/lib/consoleImages.ts` maps each console (by its backend
`slug`) to its photo file; consoles without an entry show `Placeholder.png`.
