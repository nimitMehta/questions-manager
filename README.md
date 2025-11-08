# Questions Manager

A web application for managing question papers and questions with authentication.

## Features

- Secure authentication system
- Create and manage question papers
- Add, edit, and delete questions
- View questions by paper
- Modern, responsive UI
- Mobile-friendly design

## Tech Stack

- Node.js
- Express.js
- MongoDB (Mongoose)
- EJS templating
- Bootstrap 4

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
AUTH_USERNAME=your_username
AUTH_PASSWORD=your_password
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_session_secret_key
NODE_ENV=production
PORT=3000
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your credentials (see above)

3. Start the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Deployment on Render

See deployment instructions below.

