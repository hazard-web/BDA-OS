# 💼 PaySlip Pro

A fully functional **Payslip Generator** web application built with **React + Node.js (Express) + MongoDB**.

## ✨ Features

- ✅ **Generate Payslips** — 5-step form: Company → Employee → Pay Period → Earnings → Deductions
- ✅ **PDF Download** — Beautiful, professionally designed A4 payslip PDF with your company branding
- ✅ **Email Payslip** — Send PDF directly to employee's email via Gmail SMTP
- ✅ **Live Salary Summary** — Real-time gross, deductions, and net salary calculation
- ✅ **Payslip Management** — List, search, filter, view, and delete payslips
- ✅ **Dashboard** — Stats: total payslips, this month's count, emails sent, average salary
- ✅ **MongoDB Storage** — All data persisted in MongoDB

---

## 🗂 Project Structure

```
payslip-generator/
├── backend/
│   ├── models/
│   │   └── Payslip.js          # Mongoose schema with auto-computed totals
│   ├── routes/
│   │   └── payslip.js          # REST API routes (CRUD + PDF + Email)
│   ├── utils/
│   │   ├── pdfGenerator.js     # PDFKit A4 payslip generator (streams to response)
│   │   ├── pdfBuffer.js        # PDF as Buffer (for email attachment)
│   │   └── emailService.js     # Nodemailer email with branded HTML template
│   ├── server.js               # Express app entry point
│   ├── package.json
│   └── .env                    # local secrets, not in git
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Dashboard.jsx       # Stats + recent payslips
    │   │   ├── GeneratePayslip.jsx # Multi-step form
    │   │   ├── PayslipList.jsx     # Searchable/filterable table
    │   │   └── PayslipDetail.jsx   # Full view + Download + Email
    │   ├── components/
    │   │   └── Layout.jsx          # Sidebar navigation
    │   ├── App.jsx
    │   ├── api.js                  # Axios client
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **MongoDB** running locally (or a MongoDB Atlas URI)
- A **Gmail account** with an [App Password](https://myaccount.google.com/apppasswords) (for email)

---

### 1. Clone / Download the project

```bash
cd payslip-generator
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env` (not committed). Local and Render/Vercel each have their own values.

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/payslip_generator

EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=PaySlip Pro <your_gmail@gmail.com>
```

> 💡 **Gmail App Password setup:**
> 1. Go to [Google Account Settings](https://myaccount.google.com)
> 2. Security → 2-Step Verification → App Passwords
> 3. Generate a password for "Mail"
> 4. Use that 16-character password as `EMAIL_PASS`

Start the backend:

```bash
npm run dev       # development (with nodemon)
# or
npm start         # production
```

Backend will run at → **http://localhost:5000**

---

### 3. Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
```

Frontend will run at → **http://localhost:3000**

> The Vite dev server automatically proxies `/api` requests to `http://localhost:5000`

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payslips` | Create a new payslip |
| `GET` | `/api/payslips` | List payslips (with `search`, `month`, `year`, `page`, `limit` query params) |
| `GET` | `/api/payslips/:id` | Get a single payslip |
| `PUT` | `/api/payslips/:id` | Update a payslip |
| `DELETE` | `/api/payslips/:id` | Delete a payslip |
| `GET` | `/api/payslips/:id/download` | Download payslip as PDF |
| `POST` | `/api/payslips/:id/email` | Email payslip to employee (pass `{ email }` to override) |
| `GET` | `/api/payslips/stats/summary` | Dashboard statistics |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| HTTP Client | Axios |
| Toast Notifications | react-hot-toast |
| Icons | Lucide React |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| PDF Generation | PDFKit |
| Email | Nodemailer (Gmail SMTP) |

---

## 🏗 Production & Deployment

### Local Production Build (Single Server)
By default, the backend `server.js` is already configured to serve the compiled React frontend!

1. Build the frontend:
```bash
cd frontend
npm run build
```
2. Start the backend:
```bash
cd ../backend
npm start
```
Your entire application (Frontend + Backend APIs) will now be running smoothly at **http://localhost:5000**!

### 🌍 Deploy to the Internet (Render.com)
The easiest way to deploy this app to a live public URL for free:

1. Create a free **MongoDB Atlas** account and get your Database Connection String (`mongodb+srv://...`).
2. Update your GitHub repository with your latest code.
3. Sign into **Render.com** and create a new **Web Service**, linking your GitHub repo.
4. Use the following configuration on Render:
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && cd ../frontend && npm install && npm run build`
   - **Start Command:** `node server.js`
5. Add your `.env` variables under Render's Environment Variables section:
   - `MONGODB_URI`
   - `EMAIL_USER`
   - `EMAIL_PASS`
   - `EMAIL_FROM`

Your app will build and automatically deploy to a free live URL!

---

## 🔧 Common Issues

**MongoDB connection refused**
> Ensure MongoDB is running: `mongod` or `brew services start mongodb-community`

**Email not sending**
> - Make sure `EMAIL_USER` and `EMAIL_PASS` are set in `.env`
> - Use a Gmail **App Password**, not your actual Gmail password
> - Enable 2-Step Verification on your Google Account first

**PDF download empty**
> Ensure the backend is running on port 5000 and CORS is correctly configured

---

## 📄 License

MIT — Free to use and modify.
