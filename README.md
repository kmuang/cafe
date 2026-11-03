# cafe
Italian Style "Milano Café" using Tailwind and JS (responsive)

## Payments (Square)

Checkout uses the Square Web Payments SDK; the server (`server.js`) creates the payment with the Square API.
Get sandbox credentials from the Square Developer Dashboard, copy `.env.example` to `.env`, fill it in, then run:

```sh
node server.js
```

Set `SQUARE_ENV=production` for live payments.

## Reservations (Formspree)

Create a form at https://formspree.io, copy its ID (the part after `/f/` in the endpoint URL) and set `FORMSPREE_FORM_ID` in `.env`. Reservations arrive in your Formspree inbox/email. Test card (sandbox): `4111 1111 1111 1111`, any future date/CVV/ZIP.
Prices are duplicated in `server.js` (`PRICES`) so totals are computed server-side; keep them in sync with `index.html`.
