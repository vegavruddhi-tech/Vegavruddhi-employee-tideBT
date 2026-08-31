# 📱 Vegavruddhi Employee (FSE) Tide BT App

Field Sales Executive (FSE) mobile-first web app for submitting Tide Balance Transfer merchant onboarding applications, Mobikwik withdrawal forms, daily attendance, and merchant visit logs.

---

## 📐 Architecture & Port Mapping

```
Vegavruddhi-employee-tideBT/
├── backend/          # Node.js + Express Backend Service (Port 4001)
└── src/              # React 19 Mobile Web Frontend (Port 3004)
```

| Service | Technology | Port | Base URL |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 19, MUI v5, Mobile-optimized Layout | `3004` | `http://localhost:3004` |
| **Backend API** | Express 4, Mongoose 7, Redis, Google Auth | `4001` | `http://localhost:4001` |

---

## ✨ Key Features

- 🔑 **Google Sign-In & Auth**: Fast, unified SSO authentication standard across Vegavruddhi products.
- 📝 **Merchant Onboarding Forms**: Direct submission of Tide BT merchant details, document uploads, and validation checks.
- 💳 **Mobikwik Withdrawal Form**: Dedicated input interface for processing client Mobikwik payout requests.
- 📍 **Daily Attendance & Visits**: Log daily site visits, geolocation tagging, and field activity updates.
- 🎯 **FSE Performance Badge**: Compact UI header featuring the green "Tide BT" verification badge.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend**: React 19, `@mui/material` v5, `@emotion/react`, `react-router-dom` v6
- **Backend**: Express 4, Mongoose 7, `google-auth-library`, `ioredis`, `jsonwebtoken`

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:
```env
PORT=3004
REACT_APP_API_BASE=http://localhost:4001
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup
```bash
cd backend
npm install
npm start     # Backend runs on http://localhost:4001
```

### 2. Frontend Setup
```bash
npm install
npm start     # Frontend runs on http://localhost:3004
```

---

## 📄 License
Internal Proprietary Software – Vegavruddhi Technologies.
