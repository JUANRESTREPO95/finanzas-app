# Security

FinanzasApp is a **personal, self-hosted** application. It has **no
authentication** and enables CORS for all origins, so it must never be exposed
directly to the internet.

## Recommended deployment

- Run it on a private network, or behind a reverse proxy with authentication
  (basic auth, OAuth, VPN, ...).
- Keep the `data/` directory out of version control — it is already listed in
  `.gitignore`.
- Back up `data/finanzas.db` and `data/tarjetas.db` regularly.

## Reporting a vulnerability

If you find a security issue, please use GitHub's private security advisory on
this repository, or contact the maintainer directly. Please do not open a
public issue with exploit details.
