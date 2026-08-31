# 📱 Vegavruddhi Employee (FSE) Tide BT App

Field Sales Executive (FSE) mobile-first web application for submitting Tide Balance Transfer merchant onboarding applications, Mobikwik withdrawal forms, daily attendance, and merchant visit logs.

---

## 📑 Table of Contents
- [👤 User Role & Access Level](#-user-role--access-level)
- [📐 Architecture & Port Mapping](#-architecture--port-mapping)
- [✨ Features & Functionalities](#-features--functionalities)
- [🛠️ Tech Stack & Dependencies](#-tech-stack--dependencies)
- [⚙️ Environment Configuration](#️-environment-configuration)
- [🚀 Quick Start Guide](#-quick-start-guide)

---

## 👤 User Role & Access Level

- **Target User**: Field Sales Executives (FSEs) and Ground Sales Agents.
- **Access Scope**: Agent-level submission access. Submit new merchant onboarding applications, log daily attendance, submit Mobikwik withdrawal requests, and record merchant site visits.

---

## 📐 Architecture & Port Mapping

```
Vegavruddhi-employee-tideBT/
├── backend/          # Node.js + Express Backend Service (Port 4001)
└── src/              # React 19 Mobile Web Frontend (Port 3004)
```

| Service | Technology | Port | Base URL |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 19, MUI v5, Mobile Layout | `3004` | `http://localhost:3004` |
| **Backend API** | Express 4, Mongoose 7, Redis, Google Auth | `4001` | `http://localhost:4001` |

---

## ✨ Features & Functionalities

### 1. 📱 Mobile-First UI & Fast Navigation
- Clean Material-UI layout optimized for smartphones and field usage.
- Prominent green "Tide BT" badge header for quick verification of operational mode.

### 2. 🔑 One-Tap Google SSO Login
- Integrated Google OAuth Sign-In for instant authentication without needing complex password entry in the field.

### 3. 📝 Merchant Onboarding Form Workflow
- Step-by-step merchant registration form capturing Business Name, Merchant Name, Phone Number, Bank Details, and Identification (PAN/Aadhaar).
- File upload fields for store pictures, QR code photos, and verification documents.

### 4. 💳 Mobikwik Withdrawal Form (`MobikwikWithdrawForm.js`)
- Dedicated input interface to initiate Mobikwik wallet payout requests during merchant onboarding.
- Automated validation rules to ensure valid phone numbers and withdrawal bounds.

### 5. 📍 Daily Attendance & Site Visit Logs (`DailyVisitForm.js`)
- Shift start/end check-in capturing exact GPS coordinates.
- Merchant visit logger to record visit feedback, follow-up dates, and merchant sentiment.

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
Internal Proprietary Software – Vegavruddhi Technologies. All Rights Reserved.
