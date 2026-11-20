# AUTMTC Reconcile

Create a professional SaaS web application called AUTMTC Reconcile, owned by AUTMTC GROUP.

The application helps small and medium-sized businesses reconcile bank payments against outstanding customer invoices.

Brand identity:

- Premium, classic and professional.

- Dark navy, white and subtle blue accents.

- Clean typography and modern financial dashboard.

- Responsive desktop-first design.

- Currency: South African Rand (ZAR).

Build these screens:

1. Dashboard: total bank receipts, matched payments, unmatched transactions, invoices awaiting payment, recent activity.

2. Bank transactions: date, description, reference, amount, CSV upload, distinguish incoming and outgoing transactions.

3. Invoice register: invoice number, customer, invoice date, due date, outstanding amount, status, CSV upload.

4. Reconciliation: compare incoming bank transactions against outstanding invoices; prioritise exact amount and invoice-reference matches; identify partial and combined payments; flag duplicates and ambiguous matches; show confidence and explanation; require human approval before marking invoices paid.

5. Reports: matched payments, unmatched receipts, unpaid invoices and exportable reconciliation report.

Requirements: fictional sample data only; functioning interactive frontend; CSV import with column mapping; validate amounts and dates; no real bank connections, payments or accounting-record changes; never mark reconciled until user approval; modular code for later Supabase integration. Make it feel like a credible international financial software product, not a generic AI chatbot.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/06498f76-2a0d-4b13-83b7-a314edac032f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
