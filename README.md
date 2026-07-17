# 💰 FinanzasApp — Personal Finance Tracker

A self-hosted personal finance web app with multi-account management, pending payments tracking, and dark mode. Built with Node.js, Express, SQLite, and vanilla JS — installable as a PWA on iOS and Android.

## ✨ Features

| Feature | Description |
|---|---|
| 💳 Multi-account | Manage multiple accounts (bank, cash, savings, etc.) |
| ➕ Income & expenses | Log entries with date, description, amount, and account |
| ✏️ Edit & delete | Modify or remove any transaction |
| ⇄ Transfers | Move funds between accounts in one step |
| 📋 Pending payments | Track monthly bills grouped by category with partial payments |
| 📊 Available balance | Real-time total excluding savings accounts |
| 🌙 Dark mode | Full dark theme, persisted in localStorage |
| 📱 PWA | Installable on iPhone and Android as a home screen app |
| 🔗 Shortcuts API | Query pending payments via external automations (e.g. iOS Shortcuts) |

## 🛠 Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite via `better-sqlite3`
- **Frontend**: Vanilla JS, HTML5, CSS3 with CSS variables (no frameworks)
- **Deploy**: Docker + Docker Compose

## 🚀 Quick Start

```bash
# Clone and run
git clone https://github.com/JUANRESTREPO95/finanzas-app.git
cd finanzas-app
docker compose up -d --build
```

App available at: **http://localhost:3000**

## 📁 Project Structure

```
finanzas-app/
├── docker-compose.yml
├── data/                    # SQLite database volume (auto-created)
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── server.js            # Express API (accounts, movements, transfers, pending)
    ├── database.js          # SQLite setup + schema migrations
    └── frontend/
        ├── index.html       # Single page app
        ├── js.js            # Frontend logic (modals, fetch, UI state)
        └── css.css          # CSS variables, dark mode, responsive layout
```

## 🐳 Docker Commands

```bash
# Start
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

## 💾 Data Persistence

All data lives in `./data/finanzas.db` (SQLite), mounted as a bind volume. It survives container restarts and rebuilds. Backup by copying that file.

## 🗄 Database Schema

```sql
-- Accounts
cuentas (id, nombre, incluir_en_total)

-- Transactions
ingresos  (id, fecha_hora, descripcion, monto, cuenta, created_at)
salidas   (id, fecha_hora, descripcion, monto, cuenta, created_at)

-- Monthly pending payments
pendientes (id, fecha, descripcion, monto_mensual, abono, restante, pagado, categoria)
```

## 🔌 API Reference

### Accounts
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cuentas` | List all accounts |
| `POST` | `/api/cuentas` | Create account |
| `DELETE` | `/api/cuentas/:nombre` | Delete account |
| `PUT` | `/api/cuentas/:nombre/visible` | Toggle account in total |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/movimientos` | All movements (sorted by date) |
| `POST` | `/api/ingresos` | Add income |
| `POST` | `/api/salidas` | Add expense |
| `PUT` | `/api/movimientos/:tipo/:id` | Edit movement |
| `DELETE` | `/api/movimientos/:tipo/:id` | Delete movement |
| `POST` | `/api/transferencia` | Transfer between accounts |

### Balances
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/totales` | Balance per account |
| `GET` | `/api/totales/sin-ahorros` | Total excluding hidden accounts |

### Pending Payments
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/pendientes` | Unpaid items |
| `GET` | `/api/pendientes/all` | All items (paid + unpaid) |
| `POST` | `/api/pendientes/nuevo` | Add item |
| `PUT` | `/api/pendientes/:id` | Edit item |
| `PUT` | `/api/pendientes/abono` | Record partial payments (batch) |
| `DELETE` | `/api/pendientes/:id` | Delete item |
| `POST` | `/api/pendientes/reiniciar` | Reset all monthly payments |
| `GET` | `/api/consulta/pendientes` | Formatted summary (for iOS Shortcuts) |

## 📱 Install as PWA

On **iPhone**: open in Safari → Share → "Add to Home Screen"  
On **Android**: open in Chrome → menu → "Add to Home Screen"

## 📄 License

MIT
