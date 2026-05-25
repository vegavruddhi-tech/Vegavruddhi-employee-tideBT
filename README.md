# Tide BT Employee Dashboard

Tide BT (Balance Transfer) employee panel for Vegavruddhi.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The app will run on **http://localhost:3004**

## Features

- ✅ Login with Google (same authentication as Tide)
- ✅ Dashboard with employee info
- ✅ Profile page
- ✅ Same UI/design as existing Tide dashboard
- ✅ "Tide BT" label in green box
- ✅ No task or notification icons (simplified navbar)

## Ports

- **Frontend**: 3004
- **Backend**: 4001 (to be created)

## Environment Variables

Create `.env` file:
```
REACT_APP_API_BASE=http://localhost:4001
PORT=3004
```

## Next Steps

1. Build backend on port 4001
2. Add form submission features
3. Add merchant tracking
4. Add analytics/reports
