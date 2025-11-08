require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');

// Suppress the specific DEP0170 deprecation warning for MongoDB connection strings
// This warning occurs because MongoDB replica set URLs contain multiple hosts,
// which is valid for MongoDB but triggers Node.js URL parser warnings
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, type, code, ...args) {
    // Check if this is the DEP0170 warning about MongoDB URLs
    const warningStr = typeof warning === 'string' ? warning : (warning?.message || String(warning));
    const isMongoDBDeprecation = 
        code === 'DEP0170' || 
        (warningStr && warningStr.includes('DEP0170') && warningStr.includes('mongodb://')) ||
        (warningStr && warningStr.includes('DEP0170') && warningStr.includes('invalid'));
    
    if (isMongoDBDeprecation) {
        // Suppress this specific deprecation warning
        return;
    }
    // For other warnings, use the original function
    if (originalEmitWarning) {
        return originalEmitWarning.apply(process, [warning, type, code, ...args]);
    }
};

const app = express();

// Helper function to properly encode MongoDB connection string
function encodeMongoURI(uri) {
    try {
        // For mongodb+srv:// URLs, manually parse and encode credentials
        if (uri.startsWith('mongodb+srv://')) {
            // Extract the part after mongodb+srv://
            const afterProtocol = uri.substring(14); // 'mongodb+srv://'.length = 14
            const atIndex = afterProtocol.indexOf('@');
            
            if (atIndex === -1) {
                // No credentials, return as-is
                return uri;
            }
            
            // Split credentials and rest of URL
            const credentials = afterProtocol.substring(0, atIndex);
            const rest = afterProtocol.substring(atIndex + 1);
            
            // Split username and password
            const colonIndex = credentials.indexOf(':');
            if (colonIndex === -1) {
                // Only username, no password
                const encodedUsername = encodeURIComponent(credentials);
                return `mongodb+srv://${encodedUsername}@${rest}`;
            }
            
            const username = credentials.substring(0, colonIndex);
            const password = credentials.substring(colonIndex + 1);
            
            // Encode username and password
            const encodedUsername = encodeURIComponent(username);
            const encodedPassword = encodeURIComponent(password);
            
            return `mongodb+srv://${encodedUsername}:${encodedPassword}@${rest}`;
        } else if (uri.startsWith('mongodb://')) {
            // For standard mongodb:// URLs, try using URL constructor
            // Replace mongodb:// with http:// temporarily for parsing
            const tempUri = uri.replace('mongodb://', 'http://');
            try {
                const url = new URL(tempUri);
                const encodedUsername = encodeURIComponent(url.username || '');
                const encodedPassword = encodeURIComponent(url.password || '');
                const auth = encodedUsername && encodedPassword 
                    ? `${encodedUsername}:${encodedPassword}@` 
                    : encodedUsername ? `${encodedUsername}@` : '';
                return `mongodb://${auth}${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}${url.search}`;
            } catch (e) {
                // If URL parsing fails, manually parse
                const afterProtocol = uri.substring(10); // 'mongodb://'.length = 10
                const atIndex = afterProtocol.indexOf('@');
                
                if (atIndex === -1) {
                    return uri;
                }
                
                const credentials = afterProtocol.substring(0, atIndex);
                const rest = afterProtocol.substring(atIndex + 1);
                
                const colonIndex = credentials.indexOf(':');
                if (colonIndex === -1) {
                    const encodedUsername = encodeURIComponent(credentials);
                    return `mongodb://${encodedUsername}@${rest}`;
                }
                
                const username = credentials.substring(0, colonIndex);
                const password = credentials.substring(colonIndex + 1);
                const encodedUsername = encodeURIComponent(username);
                const encodedPassword = encodeURIComponent(password);
                
                return `mongodb://${encodedUsername}:${encodedPassword}@${rest}`;
            }
        }
        return uri;
    } catch (error) {
        // If parsing fails, return original URI
        console.warn('Warning: Could not parse MongoDB URI, using as-is:', error.message);
        return uri;
    }
}

const rawUrl = process.env.MONGODB_URI || `mongodb+srv://Bapubaby:JhanviKotak2009@fastners.e3aqj.mongodb.net/question-fillers?retryWrites=true&w=majority`;
const url = encodeMongoURI(rawUrl);

mongoose.connect(url, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to DB!!!!");
}).catch((err) => {
    console.log("ERROR:", err.message);
});

// Authentication credentials (you can change these)
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';

// Log credential status (production-safe - doesn't expose actual values)
console.log('=== Authentication Configuration ===');
console.log('AUTH_USERNAME from env:', process.env.AUTH_USERNAME ? 'SET' : 'NOT SET (using default)');
console.log('AUTH_PASSWORD from env:', process.env.AUTH_PASSWORD ? 'SET' : 'NOT SET (using default)');
console.log('AUTH_USERNAME value length:', AUTH_USERNAME ? AUTH_USERNAME.length : 0, 'characters');
console.log('AUTH_PASSWORD value length:', AUTH_PASSWORD ? AUTH_PASSWORD.length : 0, 'characters');
console.log('AUTH_USERNAME first char:', AUTH_USERNAME ? AUTH_USERNAME.charAt(0) : 'N/A');
console.log('AUTH_PASSWORD first char:', AUTH_PASSWORD ? AUTH_PASSWORD.charAt(0) : 'N/A');
console.log('===================================');

// Options schema for nested documents
const optionSchema = new mongoose.Schema({
    optionName: { type: String, required: true }, // e.g., "option A", "option B"
    description: { type: String, required: true }
}, { _id: false });

// Questions schema
const questionsSchema = new mongoose.Schema({
    question: { type: String, required: true },
    options: { type: [optionSchema], required: true },
    correctAnswer: { type: String, required: true }, // e.g., "option C"
    paperName: { type: String, required: true },
    year: { type: String, required: true },
    correctOptionDescription: { type: String, required: true }
}, { timestamps: true });

const Question = mongoose.model(
    "questions",
    questionsSchema
);

app.use(require('express-status-monitor')());

// Session configuration
// Note: On Render, secure cookies work with HTTPS. If you're behind a proxy, 
// you may need to set trust proxy: app.set('trust proxy', 1)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
        sameSite: 'lax' // CSRF protection
    }
};

// Log session configuration (production-safe)
console.log('=== Session Configuration ===');
console.log('SESSION_SECRET from env:', process.env.SESSION_SECRET ? 'SET' : 'NOT SET (using default)');
console.log('Cookie secure flag:', sessionConfig.cookie.secure);
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('============================');

app.use(session(sessionConfig));

// Trust proxy for secure cookies behind reverse proxy (Render uses this)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('Trust proxy enabled for production');
}

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
app.set('view engine','ejs');

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        return res.redirect('/login');
    }
};

// Debug endpoint to check auth configuration (production-safe)
app.get('/debug/auth', (req, res) => {
    res.json({
        authUsernameSet: !!process.env.AUTH_USERNAME,
        authPasswordSet: !!process.env.AUTH_PASSWORD,
        authUsernameLength: AUTH_USERNAME ? AUTH_USERNAME.length : 0,
        authPasswordLength: AUTH_PASSWORD ? AUTH_PASSWORD.length : 0,
        sessionSecretSet: !!process.env.SESSION_SECRET,
        nodeEnv: process.env.NODE_ENV || 'not set',
        cookieSecure: sessionConfig.cookie.secure,
        timestamp: new Date().toISOString()
    });
});

// Login routes
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Production-safe debug logging
    console.log('=== Login Attempt ===');
    console.log('Username received length:', username ? username.length : 0);
    console.log('Password received length:', password ? password.length : 0);
    console.log('Expected username length:', AUTH_USERNAME ? AUTH_USERNAME.length : 0);
    console.log('Expected password length:', AUTH_PASSWORD ? AUTH_PASSWORD.length : 0);
    console.log('Username exact match:', username === AUTH_USERNAME);
    console.log('Password exact match:', password === AUTH_PASSWORD);
    console.log('Username trimmed match:', username && username.trim() === AUTH_USERNAME);
    console.log('Password trimmed match:', password && password.trim() === AUTH_PASSWORD);
    
    // Check for whitespace issues
    if (username && username !== username.trim()) {
        console.log('WARNING: Username has leading/trailing whitespace!');
    }
    if (password && password !== password.trim()) {
        console.log('WARNING: Password has leading/trailing whitespace!');
    }
    
    // Trim inputs for comparison
    const trimmedUsername = username ? username.trim() : '';
    const trimmedPassword = password ? password.trim() : '';
    
    if (trimmedUsername === AUTH_USERNAME && trimmedPassword === AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = trimmedUsername;
        console.log('Login SUCCESS');
        console.log('================');
        return res.redirect('/');
    } else {
        console.log('Login FAILED');
        console.log('================');
        return res.render('login', { error: 'Invalid username or password' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});

// Home route - list all papers (protected)
app.get('/', requireAuth, async (req, res) => {
    // Get all unique paper combinations
    const papers = await Question.aggregate([
        {
            $group: {
                _id: { paperName: "$paperName", year: "$year" },
                questionCount: { $sum: 1 }
            }
        },
        {
            $sort: { "_id.paperName": 1, "_id.year": -1 }
        }
    ]);
    
    // Format papers for easier use in template
    const papersList = papers.map(paper => ({
        paperName: paper._id.paperName,
        year: paper._id.year,
        questionCount: paper.questionCount
    }));
    
    res.render('home', { papersList, username: req.session.username });
});

// View questions for a specific paper (protected)
app.get('/paper/:paperName/:year', requireAuth, async (req, res) => {
    const { paperName, year } = req.params;
    const decodedPaperName = decodeURIComponent(paperName);
    const decodedYear = decodeURIComponent(year);
    
    const questionsList = await Question.find({ 
        paperName: decodedPaperName, 
        year: decodedYear 
    }).sort({ createdAt: -1 });
    
    res.render('viewQuestions', { 
        questionsList, 
        paperName: decodedPaperName, 
        year: decodedYear,
        username: req.session.username 
    });
});

// Start adding questions - get paper name and year, redirect to add page (protected)
app.post('/question/start', requireAuth, (req, res) => {
    const { paperName, year } = req.body;
    // Encode paper name and year for URL
    const encodedPaperName = encodeURIComponent(paperName);
    const encodedYear = encodeURIComponent(year);
    res.redirect(`/question/add?paperName=${encodedPaperName}&year=${encodedYear}`);
});

// Get add question page with paper name and year (protected)
app.get('/question/add', requireAuth, (req, res) => {
    const { paperName, year } = req.query;
    if (!paperName || !year) {
        return res.redirect('/');
    }
    res.render('addQuestion', { paperName, year });
});

// Post add question (protected)
app.post('/question/add', requireAuth, async (req, res) => {
    const { question, paperName, year, correctAnswer, correctOptionDescription } = req.body;
    
    // Build options array from form data
    const options = [];
    const optionNames = ['option A', 'option B', 'option C', 'option D'];
    
    for (let i = 0; i < optionNames.length; i++) {
        const optionDesc = req.body[`option${i}`];
        if (optionDesc && optionDesc.trim() !== '') {
            options.push({
                optionName: optionNames[i],
                description: optionDesc
            });
        }
    }
    
    await Question.create({ 
        question, 
        options, 
        correctAnswer, 
        paperName, 
        year, 
        correctOptionDescription 
    });
    
    // Redirect back to add page with same paper name and year to add more questions
    const encodedPaperName = encodeURIComponent(paperName);
    const encodedYear = encodeURIComponent(year);
    res.redirect(`/question/add?paperName=${encodedPaperName}&year=${encodedYear}`);
});

// Get edit question page (protected)
app.get('/question/edit/:questionId', requireAuth, async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    res.render('editQuestion', { question });
});

// Post edit question (protected)
app.post('/question/edit/:questionId', requireAuth, async (req, res) => {
    const { question, paperName, year, correctAnswer, correctOptionDescription } = req.body;
    
    // Build options array from form data
    const options = [];
    const optionNames = ['option A', 'option B', 'option C', 'option D'];
    
    for (let i = 0; i < optionNames.length; i++) {
        const optionDesc = req.body[`option${i}`];
        if (optionDesc && optionDesc.trim() !== '') {
            options.push({
                optionName: optionNames[i],
                description: optionDesc
            });
        }
    }
    
    await Question.findByIdAndUpdate(req.params.questionId, { 
        question, 
        options, 
        correctAnswer, 
        paperName, 
        year, 
        correctOptionDescription 
    });
    
    // Redirect back to the paper's questions page
    const encodedPaperName = encodeURIComponent(paperName);
    const encodedYear = encodeURIComponent(year);
    res.redirect(`/paper/${encodedPaperName}/${encodedYear}`);
});

// Delete question (protected)
app.post('/question/delete/:questionId', requireAuth, async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    if (question) {
        const encodedPaperName = encodeURIComponent(question.paperName);
        const encodedYear = encodeURIComponent(question.year);
        await Question.findByIdAndDelete(req.params.questionId);
        res.redirect(`/paper/${encodedPaperName}/${encodedYear}`);
    } else {
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server has Started on port ${PORT}`);
});
