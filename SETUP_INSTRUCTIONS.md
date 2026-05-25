# 🚀 Tide BT Employee Dashboard - Setup Instructions

## Quick Start

### 1. Install Dependencies
```bash
cd Vegavruddhi-employee-tideBT
npm install
```

### 2. Start Development Server
```bash
npm start
```

The app will automatically open at **http://localhost:3004**

---

## ✅ What You'll See

1. **Login Page** - Google Sign-In
2. **Popup** - If you have Tide BT access, you'll see 2 buttons (Tide / Tide BT)
3. **Dashboard** - Green welcome card with **"Tide BT"** label
4. **Navbar** - Simplified (no task/bell icons)
5. **Profile** - Employee details page

---

## 🔧 Configuration

### Ports:
- **Frontend**: 3004
- **Backend**: 4001 (to be created)

### Environment:
Check `.env` file:
```env
REACT_APP_API_BASE=http://localhost:4001
PORT=3004
```

---

## 📋 Features Implemented

✅ Login with Google (same as Tide)
✅ Dashboard with "Tide BT" label
✅ Profile page
✅ Simplified navbar (no tasks/notifications)
✅ Same UI/colors as existing Tide
✅ Employee ID display
✅ Quick overview cards

---

## 🚧 Coming Soon

- Form submission page
- Merchant tracking
- Analytics/KPIs
- Points system (if needed)

---

## 🐛 Troubleshooting

### Port Already in Use?
```bash
# Kill process on port 3004
lsof -ti:3004 | xargs kill -9

# Or change port in .env
PORT=3005
```

### Backend Not Running?
- Backend needs to be created on port 4001
- For now, login will work but API calls will fail
- This is expected until backend is built

---

## 📞 Need Help?

Check the main README.md or TIDE_BT_FRONTEND_SETUP.md for detailed documentation.

---

**Happy Coding! 🎉**
