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

// Debug: Log if credentials are loaded (only in development)
if (process.env.NODE_ENV !== 'production') {
    console.log('Auth Username loaded:', AUTH_USERNAME ? 'Yes' : 'No');
    console.log('Auth Password loaded:', AUTH_PASSWORD ? 'Yes' : 'No');
}

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
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

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

// Login routes
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Debug logging (only in development)
    if (process.env.NODE_ENV !== 'production') {
        console.log('Login attempt - Username received:', username);
        console.log('Login attempt - Password received:', password ? '***' : 'empty');
        console.log('Expected username:', AUTH_USERNAME);
        console.log('Username match:', username === AUTH_USERNAME);
        console.log('Password match:', password === AUTH_PASSWORD);
    }
    
    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = username;
        return res.redirect('/');
    } else {
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
