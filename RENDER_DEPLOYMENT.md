# Deployment Guide for Render

## Step-by-Step Instructions

### Prerequisites
1. A GitHub account
2. Your code pushed to a GitHub repository
3. A Render account (sign up at https://render.com)

---

## Step 1: Prepare Your Code

✅ **Already Done:**
- `package.json` has a `start` script
- Environment variables are configured
- Port is set to use `process.env.PORT`

---

## Step 2: Push Code to GitHub

1. **Initialize Git** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit - Questions Manager"
```

2. **Create a GitHub repository:**
   - Go to https://github.com/new
   - Create a new repository (e.g., `questions-manager`)
   - **DO NOT** initialize with README, .gitignore, or license

3. **Push your code:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/questions-manager.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy on Render

### 3.1 Create a New Web Service

1. Go to https://dashboard.render.com
2. Click **"New +"** button
3. Select **"Web Service"**

### 3.2 Connect Your Repository

1. Click **"Connect account"** if you haven't connected GitHub
2. Authorize Render to access your GitHub
3. Select your repository (`questions-manager`)
4. Click **"Connect"**

### 3.3 Configure Your Service

Fill in the following details:

- **Name:** `questions-manager` (or your preferred name)
- **Region:** Choose closest to you (e.g., `Oregon (US West)`)
- **Branch:** `main` (or `master`)
- **Root Directory:** Leave empty (or `./` if needed)
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### 3.4 Set Environment Variables

Click on **"Advanced"** and add these environment variables:

| Key | Value |
|-----|-------|
| `AUTH_USERNAME` | `admin_secure_2024` |
| `AUTH_PASSWORD` | `Qm@n@ger#2024!Secure$Pass` |
| `MONGODB_URI` | `mongodb+srv://Bapubaby:JhanviKotak2009@fastners.e3aqj.mongodb.net/question-fillers?retryWrites=true&w=majority` |
| `SESSION_SECRET` | Generate a random string (see below) |
| `NODE_ENV` | `production` |
| `PORT` | Leave empty (Render sets this automatically) |

**To generate a secure SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use any long random string like: `my-super-secret-session-key-2024-change-this`

### 3.5 Create the Service

1. Click **"Create Web Service"**
2. Render will start building and deploying your application
3. Wait for the build to complete (usually 2-5 minutes)

---

## Step 4: Verify Deployment

1. Once deployed, you'll see a URL like: `https://questions-manager.onrender.com`
2. Click on the URL to open your application
3. Try logging in with your credentials:
   - Username: `admin_secure_2024`
   - Password: `Qm@n@ger#2024!Secure$Pass`

---

## Step 5: Important Notes

### Free Tier Limitations:
- **Spinning down:** Free services spin down after 15 minutes of inactivity
- **First request:** May take 30-60 seconds to wake up
- **Upgrade:** Consider upgrading to paid plan for always-on service

### Security:
- ✅ Never commit `.env` file to GitHub (already in `.gitignore`)
- ✅ Use strong passwords in production
- ✅ Change default credentials
- ✅ Use HTTPS (Render provides this automatically)

### Monitoring:
- Check **"Logs"** tab in Render dashboard for any errors
- Monitor **"Metrics"** for performance

---

## Troubleshooting

### Build Fails:
- Check build logs in Render dashboard
- Ensure all dependencies are in `package.json`
- Verify `start` script exists

### Application Crashes:
- Check runtime logs
- Verify all environment variables are set
- Ensure MongoDB connection string is correct

### Can't Login:
- Verify environment variables are set correctly
- Check that `AUTH_USERNAME` and `AUTH_PASSWORD` match exactly
- Check logs for authentication errors

---

## Updating Your Application

1. Make changes to your code
2. Commit and push to GitHub:
```bash
git add .
git commit -m "Your update message"
git push
```
3. Render will automatically detect changes and redeploy

---

## Custom Domain (Optional)

1. Go to your service settings
2. Click **"Custom Domains"**
3. Add your domain
4. Follow DNS configuration instructions

---

## Support

- Render Docs: https://render.com/docs
- Render Support: https://render.com/docs/support

